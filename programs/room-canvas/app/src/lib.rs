#![no_std]

use gearbase_core::{
    ParticipantKind, Profile, RateLimitConfig, RoomCaps, RoomCore, RoomError,
};
use sails_rs::{cell::RefCell, prelude::*};

const PROGRAM_VERSION: u16 = 1;
const MAX_PALETTE_SIZE: u16 = 16;

type RoomInfoView = (String, u16, ActorId, u64, Vec<u8>);
type SinceView = (u64, Vec<(u64, Vec<u8>)>, bool);
type ParticipantView = (ActorId, String, u16, u64);

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TypeInfo, ReflectHash)]
#[codec(crate = sails_rs::scale_codec)]
#[type_info(crate = sails_rs::type_info)]
#[reflect_hash(crate = sails_rs)]
pub struct CanvasConfig {
    pub width: u16,
    pub height: u16,
    pub palette_size: u16,
    pub cooldown_secs: u16,
}

impl CanvasConfig {
    fn validate(&self) -> Result<(), RoomError> {
        if self.width == 0 || self.height == 0 || self.palette_size == 0 {
            return Err(RoomError::InvalidConfig);
        }
        if self.palette_size > MAX_PALETTE_SIZE {
            return Err(RoomError::InvalidConfig);
        }
        Ok(())
    }

    fn packed_len(&self) -> usize {
        (self.width as usize * self.height as usize).div_ceil(2)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TypeInfo, ReflectHash)]
#[codec(crate = sails_rs::scale_codec)]
#[type_info(crate = sails_rs::type_info)]
#[reflect_hash(crate = sails_rs)]
pub struct CanvasSnapshot {
    pub config: CanvasConfig,
    pub pixels: Vec<u8>,
}

#[event]
#[derive(Clone, Debug, PartialEq, Eq, Encode, TypeInfo, ReflectHash)]
#[codec(crate = sails_rs::scale_codec)]
#[type_info(crate = sails_rs::type_info)]
#[reflect_hash(crate = sails_rs)]
pub enum CanvasRoomEvent {
    Joined([u8; 32]),
    Left([u8; 32]),
    Updated(u64),
    Closed,
    Configured(u64),
    PixelPlaced { x: u16, y: u16, color: u16, who: [u8; 32] },
}

fn kind_from_code(kind: u16) -> Result<ParticipantKind, RoomError> {
    match kind {
        0 => Ok(ParticipantKind::Unknown),
        1 => Ok(ParticipantKind::Human),
        2 => Ok(ParticipantKind::Agent),
        _ => Err(RoomError::InvalidKind),
    }
}

fn kind_code(kind: ParticipantKind) -> u16 {
    match kind {
        ParticipantKind::Unknown => 0,
        ParticipantKind::Human => 1,
        ParticipantKind::Agent => 2,
    }
}

pub struct CanvasState {
    room: RoomCore,
    config: CanvasConfig,
    pixels: Vec<u8>,
    last_placed_at: collections::BTreeMap<ActorId, u64>,
}

impl CanvasState {
    fn new(owner: ActorId, config: CanvasConfig, created_at: u64) -> Result<Self, RoomError> {
        config.validate()?;

        let pixels = vec![0; config.packed_len()];
        let room = RoomCore::new(
            "canvas",
            PROGRAM_VERSION,
            owner,
            created_at,
            config.encode(),
            RoomCaps::default(),
            RateLimitConfig::default(),
        );

        Ok(Self {
            room,
            config,
            pixels,
            last_placed_at: collections::BTreeMap::new(),
        })
    }

    fn pixel_offset(&self, x: u16, y: u16) -> Result<(usize, bool), RoomError> {
        if x >= self.config.width || y >= self.config.height {
            return Err(RoomError::InvalidBounds);
        }

        let index = y as usize * self.config.width as usize + x as usize;
        Ok((index / 2, index % 2 == 1))
    }

    fn set_pixel(&mut self, x: u16, y: u16, color: u8) -> Result<(), RoomError> {
        let (byte_index, high_nibble) = self.pixel_offset(x, y)?;
        let current = self.pixels[byte_index];
        self.pixels[byte_index] = if high_nibble {
            (current & 0x0f) | (color << 4)
        } else {
            (current & 0xf0) | color
        };
        Ok(())
    }

    fn get_pixel(&self, x: u16, y: u16) -> Result<u8, RoomError> {
        let (byte_index, high_nibble) = self.pixel_offset(x, y)?;
        let byte = self.pixels[byte_index];
        Ok(if high_nibble { (byte >> 4) & 0x0f } else { byte & 0x0f })
    }

    fn snapshot(&self) -> Vec<u8> {
        CanvasSnapshot {
            config: self.config.clone(),
            pixels: self.pixels.clone(),
        }
        .encode()
    }
}

pub struct CanvasRoomService<'a> {
    state: &'a RefCell<CanvasState>,
}

impl<'a> CanvasRoomService<'a> {
    pub fn new(state: &'a RefCell<CanvasState>) -> Self {
        Self { state }
    }
}

#[service(events = CanvasRoomEvent)]
impl CanvasRoomService<'_> {
    #[export(unwrap_result)]
    pub fn join(&mut self, name: String, kind: u16) -> Result<u64, RoomError> {
        let caller = Syscall::message_source();
        let now = Syscall::block_timestamp();
        let profile = Profile {
            name: if name.is_empty() { None } else { Some(name) },
            kind: kind_from_code(kind)?,
            joined_at: 0,
        };

        let seq = {
            let payload_len = profile.encode().len();
            let mut state = self.state.borrow_mut();
            state.room.join(caller, profile, payload_len, now)?
        };

        let joined = CanvasRoomEvent::Joined(caller.into_bytes());
        let updated = CanvasRoomEvent::Updated(seq);
        {
            let mut state = self.state.borrow_mut();
            state.room.record_event(seq, &joined);
            state.room.record_event(seq, &updated);
        }
        self.emit_event(joined).expect("failed to emit join event");
        self.emit_event(updated)
            .expect("failed to emit updated event");

        Ok(seq)
    }

    #[export(unwrap_result)]
    pub fn leave(&mut self) -> Result<u64, RoomError> {
        let caller = Syscall::message_source();
        let now = Syscall::block_timestamp();
        let seq = self.state.borrow_mut().room.leave(caller, 0, now)?;

        let left = CanvasRoomEvent::Left(caller.into_bytes());
        let updated = CanvasRoomEvent::Updated(seq);
        {
            let mut state = self.state.borrow_mut();
            state.room.record_event(seq, &left);
            state.room.record_event(seq, &updated);
        }
        self.emit_event(left).expect("failed to emit leave event");
        self.emit_event(updated)
            .expect("failed to emit updated event");

        Ok(seq)
    }

    #[export(unwrap_result)]
    pub fn configure(&mut self, config_blob: Vec<u8>) -> Result<u64, RoomError> {
        let caller = Syscall::message_source();
        let now = Syscall::block_timestamp();
        let new_config =
            CanvasConfig::decode(&mut &config_blob[..]).map_err(|_| RoomError::InvalidConfig)?;
        new_config.validate()?;

        {
            let state = self.state.borrow();
            if new_config.width != state.config.width
                || new_config.height != state.config.height
                || new_config.palette_size != state.config.palette_size
            {
                return Err(RoomError::InvalidConfig);
            }
        }

        let seq = {
            let mut state = self.state.borrow_mut();
            let seq = state.room.configure(caller, config_blob, now)?;
            state.config = new_config;
            seq
        };

        let configured = CanvasRoomEvent::Configured(seq);
        let updated = CanvasRoomEvent::Updated(seq);
        {
            let mut state = self.state.borrow_mut();
            state.room.record_event(seq, &configured);
            state.room.record_event(seq, &updated);
        }
        self.emit_event(configured)
            .expect("failed to emit configure event");
        self.emit_event(updated)
            .expect("failed to emit updated event");

        Ok(seq)
    }

    #[export(unwrap_result)]
    pub fn close_room(&mut self) -> Result<u64, RoomError> {
        let caller = Syscall::message_source();
        let now = Syscall::block_timestamp();
        let seq = self.state.borrow_mut().room.close_room(caller, now)?;

        let closed = CanvasRoomEvent::Closed;
        let updated = CanvasRoomEvent::Updated(seq);
        {
            let mut state = self.state.borrow_mut();
            state.room.record_event(seq, &closed);
            state.room.record_event(seq, &updated);
        }
        self.emit_event(closed).expect("failed to emit close event");
        self.emit_event(updated)
            .expect("failed to emit updated event");

        Ok(seq)
    }

    #[export]
    pub fn info(&self) -> RoomInfoView {
        let info = self.state.borrow().room.info();
        (
            info.template,
            info.version,
            info.owner,
            info.created_at,
            info.config_blob,
        )
    }

    #[export]
    pub fn seq(&self) -> u64 {
        self.state.borrow().room.seq()
    }

    #[export]
    pub fn since(&self, from_seq: u64) -> SinceView {
        let since = self.state.borrow().room.since(from_seq);
        (since.seq, since.events, since.truncated)
    }

    #[export]
    pub fn snapshot(&self) -> Vec<u8> {
        self.state.borrow().snapshot()
    }

    #[export]
    pub fn participants(&self) -> Vec<ParticipantView> {
        self.state
            .borrow()
            .room
            .participants()
            .into_iter()
            .map(|(actor, profile)| {
                (
                    actor,
                    profile.name.unwrap_or_default(),
                    kind_code(profile.kind),
                    profile.joined_at,
                )
            })
            .collect()
    }

    #[export(unwrap_result)]
    pub fn place_pixel(&mut self, x: u16, y: u16, color: u16) -> Result<u64, RoomError> {
        let caller = Syscall::message_source();
        let now = Syscall::block_timestamp();
        let color = u8::try_from(color).map_err(|_| RoomError::InvalidColor)?;
        let payload_len = (x, y, u16::from(color)).encode().len();

        if u16::from(color) >= self.state.borrow().config.palette_size {
            return Err(RoomError::InvalidColor);
        }

        let seq = {
            let mut state = self.state.borrow_mut();
            let seq = state.room.participant_write(caller, payload_len, now)?;

            if state.config.cooldown_secs > 0
                && let Some(last) = state.last_placed_at.get(&caller)
            {
                let next_allowed = last.saturating_add(state.config.cooldown_secs as u64);
                if now < next_allowed {
                    return Err(RoomError::CooldownActive {
                        retry_after_secs: (next_allowed - now) as u32,
                    });
                }
            }

            state.set_pixel(x, y, color)?;
            state.last_placed_at.insert(caller, now);
            seq
        };

        let placed = CanvasRoomEvent::PixelPlaced {
            x,
            y,
            color: u16::from(color),
            who: caller.into_bytes(),
        };
        let updated = CanvasRoomEvent::Updated(seq);
        {
            let mut state = self.state.borrow_mut();
            state.room.record_event(seq, &placed);
            state.room.record_event(seq, &updated);
        }
        self.emit_event(placed).expect("failed to emit pixel event");
        self.emit_event(updated)
            .expect("failed to emit updated event");

        Ok(seq)
    }

    #[export(unwrap_result)]
    pub fn region(&self, x: u16, y: u16, w: u16, h: u16) -> Result<Vec<u8>, RoomError> {
        let state = self.state.borrow();
        if w == 0 || h == 0 {
            return Err(RoomError::InvalidBounds);
        }
        if x.saturating_add(w) > state.config.width
            || y.saturating_add(h) > state.config.height
        {
            return Err(RoomError::InvalidBounds);
        }

        let mut region = Vec::with_capacity(w as usize * h as usize);
        for yy in y..y + h {
            for xx in x..x + w {
                region.push(state.get_pixel(xx, yy)?);
            }
        }
        Ok(region)
    }
}

pub struct Program {
    state: RefCell<CanvasState>,
}

#[program]
impl Program {
    pub fn create(
        width: u16,
        height: u16,
        palette_size: u16,
        cooldown_secs: u16,
    ) -> Self {
        let owner = Syscall::message_source();
        let created_at = Syscall::block_timestamp();
        let config = CanvasConfig {
            width,
            height,
            palette_size,
            cooldown_secs,
        };
        let state = CanvasState::new(owner, config, created_at)
            .expect("invalid canvas configuration for constructor");
        Self {
            state: RefCell::new(state),
        }
    }

    pub fn room(&self) -> CanvasRoomService<'_> {
        CanvasRoomService::new(&self.state)
    }
}

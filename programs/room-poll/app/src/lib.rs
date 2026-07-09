#![no_std]

use gearbase_core::{
    ParticipantKind, Profile, RateLimitConfig, RoomCaps, RoomCore, RoomError,
};
use sails_rs::{cell::RefCell, prelude::*};

const PROGRAM_VERSION: u16 = 1;
const MIN_OPTIONS: usize = 2;
const MAX_OPTIONS: usize = 8;

type RoomInfoView = (String, u16, ActorId, u64, Vec<u8>);
type SinceView = (u64, Vec<(u64, Vec<u8>)>, bool);
type ParticipantView = (ActorId, String, u16, u64);
type PollStateView = (String, Vec<String>, bool, u64, Vec<(ActorId, u16)>, Vec<u32>);

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TypeInfo, ReflectHash)]
#[codec(crate = sails_rs::scale_codec)]
#[type_info(crate = sails_rs::type_info)]
#[reflect_hash(crate = sails_rs)]
pub struct PollConfig {
    pub question: String,
    pub options: Vec<String>,
    pub ends_at: Option<u64>,
}

impl PollConfig {
    fn validate(&self) -> Result<(), RoomError> {
        if self.question.trim().is_empty() {
            return Err(RoomError::InvalidConfig);
        }
        if !(MIN_OPTIONS..=MAX_OPTIONS).contains(&self.options.len()) {
            return Err(RoomError::InvalidConfig);
        }
        if self.options.iter().any(|option| option.trim().is_empty()) {
            return Err(RoomError::InvalidConfig);
        }

        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TypeInfo, ReflectHash)]
#[codec(crate = sails_rs::scale_codec)]
#[type_info(crate = sails_rs::type_info)]
#[reflect_hash(crate = sails_rs)]
pub struct PollSnapshot {
    pub config: PollConfig,
    pub votes: Vec<(ActorId, u8)>,
    pub tally: Vec<u32>,
}

#[event]
#[derive(Clone, Debug, PartialEq, Eq, Encode, TypeInfo, ReflectHash)]
#[codec(crate = sails_rs::scale_codec)]
#[type_info(crate = sails_rs::type_info)]
#[reflect_hash(crate = sails_rs)]
pub enum PollRoomEvent {
    Joined([u8; 32]),
    Left([u8; 32]),
    Updated(u64),
    Closed,
    Configured(u64),
    Voted { who: [u8; 32], option: u16 },
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

pub struct PollState {
    room: RoomCore,
    config: PollConfig,
    votes: collections::BTreeMap<ActorId, u8>,
    tally: Vec<u32>,
}

impl PollState {
    fn new(owner: ActorId, config: PollConfig, created_at: u64) -> Result<Self, RoomError> {
        config.validate()?;

        let tally = vec![0; config.options.len()];
        let room = RoomCore::new(
            "poll",
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
            votes: collections::BTreeMap::new(),
            tally,
        })
    }

    fn snapshot(&self) -> Vec<u8> {
        PollSnapshot {
            config: self.config.clone(),
            votes: self.votes.iter().map(|(actor, option)| (*actor, *option)).collect(),
            tally: self.tally.clone(),
        }
        .encode()
    }

    fn state_view(&self) -> PollStateView {
        (
            self.config.question.clone(),
            self.config.options.clone(),
            self.config.ends_at.is_some(),
            self.config.ends_at.unwrap_or_default(),
            self.votes
                .iter()
                .map(|(actor, option)| (*actor, u16::from(*option)))
                .collect(),
            self.tally.clone(),
        )
    }
}

pub struct PollRoomService<'a> {
    state: &'a RefCell<PollState>,
}

impl<'a> PollRoomService<'a> {
    pub fn new(state: &'a RefCell<PollState>) -> Self {
        Self { state }
    }
}

#[service(events = PollRoomEvent)]
impl PollRoomService<'_> {
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

        let joined = PollRoomEvent::Joined(caller.into_bytes());
        let updated = PollRoomEvent::Updated(seq);
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

        let left = PollRoomEvent::Left(caller.into_bytes());
        let updated = PollRoomEvent::Updated(seq);
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
            PollConfig::decode(&mut &config_blob[..]).map_err(|_| RoomError::InvalidConfig)?;
        new_config.validate()?;

        {
            let state = self.state.borrow();
            if !state.votes.is_empty() && new_config.options.len() != state.config.options.len() {
                return Err(RoomError::InvalidConfig);
            }
        }

        let seq = {
            let mut state = self.state.borrow_mut();
            let seq = state.room.configure(caller, config_blob, now)?;

            if state.votes.is_empty() {
                state.tally = vec![0; new_config.options.len()];
            } else if new_config.options.len() != state.tally.len() {
                return Err(RoomError::InvalidConfig);
            }

            state.config = new_config;
            seq
        };

        let configured = PollRoomEvent::Configured(seq);
        let updated = PollRoomEvent::Updated(seq);
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

        let closed = PollRoomEvent::Closed;
        let updated = PollRoomEvent::Updated(seq);
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
    pub fn vote(&mut self, option: u16) -> Result<u64, RoomError> {
        let caller = Syscall::message_source();
        let now = Syscall::block_timestamp();
        let payload_len = option.encode().len();
        let option = u8::try_from(option).map_err(|_| RoomError::InvalidBounds)?;

        let seq = {
            let mut state = self.state.borrow_mut();
            let seq = state.room.participant_write(caller, payload_len, now)?;
            if usize::from(option) >= state.config.options.len() {
                return Err(RoomError::InvalidBounds);
            }
            if let Some(ends_at) = state.config.ends_at
                && now > ends_at
            {
                return Err(RoomError::InvalidConfig);
            }

            if let Some(previous) = state.votes.insert(caller, option) {
                state.tally[usize::from(previous)] = state.tally[usize::from(previous)].saturating_sub(1);
            }
            state.tally[usize::from(option)] = state.tally[usize::from(option)].saturating_add(1);
            seq
        };

        let voted = PollRoomEvent::Voted {
            who: caller.into_bytes(),
            option: u16::from(option),
        };
        let updated = PollRoomEvent::Updated(seq);
        {
            let mut state = self.state.borrow_mut();
            state.room.record_event(seq, &voted);
            state.room.record_event(seq, &updated);
        }
        self.emit_event(voted).expect("failed to emit vote event");
        self.emit_event(updated)
            .expect("failed to emit updated event");

        Ok(seq)
    }

    #[export]
    pub fn tally(&self) -> Vec<u32> {
        self.state.borrow().tally.clone()
    }

    #[export]
    pub fn poll(&self) -> PollStateView {
        self.state.borrow().state_view()
    }
}

pub struct Program {
    state: RefCell<PollState>,
}

#[program]
impl Program {
    pub fn create(
        question: String,
        options: Vec<String>,
        has_ends_at: bool,
        ends_at: u64,
    ) -> Self {
        let owner = Syscall::message_source();
        let created_at = Syscall::block_timestamp();
        let config = PollConfig {
            question,
            options,
            ends_at: if has_ends_at { Some(ends_at) } else { None },
        };
        let state =
            PollState::new(owner, config, created_at).expect("invalid poll configuration");
        Self {
            state: RefCell::new(state),
        }
    }

    pub fn room(&self) -> PollRoomService<'_> {
        PollRoomService::new(&self.state)
    }
}

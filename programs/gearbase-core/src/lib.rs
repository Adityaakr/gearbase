#![no_std]

use sails_rs::prelude::*;

pub const DEFAULT_EVENT_CAP: u16 = 512;
pub const DEFAULT_MAX_PAYLOAD_BYTES: u16 = 2048;
pub const DEFAULT_MAX_PROFILE_NAME_BYTES: u16 = 32;
pub const DEFAULT_RATE_LIMIT_CAPACITY: u16 = 20;
pub const DEFAULT_RATE_LIMIT_REFILL_PER_MINUTE: u16 = 20;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Encode, Decode, TypeInfo, ReflectHash)]
#[codec(crate = sails_rs::scale_codec)]
#[type_info(crate = sails_rs::type_info)]
#[reflect_hash(crate = sails_rs)]
pub enum ParticipantKind {
    Unknown,
    Human,
    Agent,
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TypeInfo, ReflectHash)]
#[codec(crate = sails_rs::scale_codec)]
#[type_info(crate = sails_rs::type_info)]
#[reflect_hash(crate = sails_rs)]
pub struct Profile {
    pub name: Option<String>,
    pub kind: ParticipantKind,
    pub joined_at: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TypeInfo, ReflectHash)]
#[codec(crate = sails_rs::scale_codec)]
#[type_info(crate = sails_rs::type_info)]
#[reflect_hash(crate = sails_rs)]
pub struct RoomInfo {
    pub template: String,
    pub version: u16,
    pub owner: ActorId,
    pub created_at: u64,
    pub config_blob: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TypeInfo, ReflectHash)]
#[codec(crate = sails_rs::scale_codec)]
#[type_info(crate = sails_rs::type_info)]
#[reflect_hash(crate = sails_rs)]
pub struct SinceResult {
    pub seq: u64,
    pub events: Vec<(u64, Vec<u8>)>,
    pub truncated: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TypeInfo, ReflectHash)]
#[codec(crate = sails_rs::scale_codec)]
#[type_info(crate = sails_rs::type_info)]
#[reflect_hash(crate = sails_rs)]
pub struct RoomCaps {
    pub max_payload_bytes: u16,
    pub max_profile_name_bytes: u16,
    pub event_capacity: u16,
}

impl Default for RoomCaps {
    fn default() -> Self {
        Self {
            max_payload_bytes: DEFAULT_MAX_PAYLOAD_BYTES,
            max_profile_name_bytes: DEFAULT_MAX_PROFILE_NAME_BYTES,
            event_capacity: DEFAULT_EVENT_CAP,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TypeInfo, ReflectHash)]
#[codec(crate = sails_rs::scale_codec)]
#[type_info(crate = sails_rs::type_info)]
#[reflect_hash(crate = sails_rs)]
pub struct RateLimitConfig {
    pub capacity: u16,
    pub refill_per_minute: u16,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            capacity: DEFAULT_RATE_LIMIT_CAPACITY,
            refill_per_minute: DEFAULT_RATE_LIMIT_REFILL_PER_MINUTE,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TypeInfo, ReflectHash)]
#[codec(crate = sails_rs::scale_codec)]
#[type_info(crate = sails_rs::type_info)]
#[reflect_hash(crate = sails_rs)]
pub enum RoomError {
    Closed,
    NotOwner,
    AlreadyJoined,
    NotJoined,
    AlreadySeated,
    SeatOccupied,
    NotAllowed,
    ParticipantsFull,
    NameTooLong {
        max_bytes: u16,
    },
    PayloadTooLarge {
        actual_bytes: u32,
        max_bytes: u16,
    },
    RateLimited {
        retry_after_secs: u32,
    },
    InvalidConfig,
    InvalidKind,
    InvalidBounds,
    InvalidColor,
    WrongPhase,
    AlreadyVoted,
    CommitMismatch,
    RevealTimeoutPending {
        remaining_secs: u32,
    },
    CooldownActive {
        retry_after_secs: u32,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct MembershipState {
    participants: collections::BTreeMap<ActorId, Profile>,
    allowlist: Option<collections::BTreeSet<ActorId>>,
    max_participants: Option<u16>,
}

impl MembershipState {
    fn new() -> Self {
        Self {
            participants: collections::BTreeMap::new(),
            allowlist: None,
            max_participants: None,
        }
    }

    fn participants(&self) -> Vec<(ActorId, Profile)> {
        self.participants
            .iter()
            .map(|(actor, profile)| (*actor, profile.clone()))
            .collect()
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct EventSequencer {
    seq: u64,
    cap: usize,
    events: collections::VecDeque<(u64, Vec<u8>)>,
}

impl EventSequencer {
    fn new(cap: u16) -> Self {
        Self {
            seq: 0,
            cap: cap as usize,
            events: collections::VecDeque::new(),
        }
    }

    fn seq(&self) -> u64 {
        self.seq
    }

    fn next_seq(&mut self) -> u64 {
        self.seq = self.seq.saturating_add(1);
        self.seq
    }

    fn push(&mut self, seq: u64, blob: Vec<u8>) {
        if self.cap == 0 {
            return;
        }

        if self.events.len() == self.cap {
            self.events.pop_front();
        }
        self.events.push_back((seq, blob));
    }

    fn since(&self, from_seq: u64) -> SinceResult {
        let current_seq = self.seq;
        let Some((oldest_seq, _)) = self.events.front() else {
            return SinceResult {
                seq: current_seq,
                events: Vec::new(),
                truncated: false,
            };
        };

        let truncated = from_seq.saturating_add(1) < *oldest_seq;
        let events = self
            .events
            .iter()
            .filter(|(seq, _)| truncated || *seq > from_seq)
            .map(|(seq, blob)| (*seq, blob.clone()))
            .collect();

        SinceResult {
            seq: current_seq,
            events,
            truncated,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct TokenBucket {
    tokens_millis: u64,
    last_refill_secs: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RateLimiter {
    config: RateLimitConfig,
    buckets: collections::BTreeMap<ActorId, TokenBucket>,
}

impl RateLimiter {
    pub fn new(config: RateLimitConfig) -> Self {
        Self {
            config,
            buckets: collections::BTreeMap::new(),
        }
    }

    pub fn check_at(&mut self, actor: ActorId, now_secs: u64) -> Result<(), RoomError> {
        let capacity_millis = self.config.capacity as u64 * 1000;
        let refill_per_minute = self.config.refill_per_minute as u64;
        let bucket = self.buckets.entry(actor).or_insert(TokenBucket {
            tokens_millis: capacity_millis,
            last_refill_secs: now_secs,
        });

        if now_secs > bucket.last_refill_secs && refill_per_minute > 0 {
            let elapsed = now_secs - bucket.last_refill_secs;
            let refill = elapsed.saturating_mul(refill_per_minute).saturating_mul(1000) / 60;
            bucket.tokens_millis = capacity_millis.min(bucket.tokens_millis.saturating_add(refill));
            bucket.last_refill_secs = now_secs;
        } else {
            bucket.last_refill_secs = now_secs;
        }

        if bucket.tokens_millis < 1000 {
            let missing = 1000 - bucket.tokens_millis;
            let retry_after_secs = if refill_per_minute == 0 {
                u32::MAX
            } else {
                ((missing.saturating_mul(60) + (refill_per_minute * 1000) - 1)
                    / (refill_per_minute * 1000))
                    .max(1) as u32
            };

            return Err(RoomError::RateLimited { retry_after_secs });
        }

        bucket.tokens_millis -= 1000;
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RoomCore {
    info: RoomInfo,
    caps: RoomCaps,
    closed: bool,
    membership: MembershipState,
    sequencer: EventSequencer,
    rate_limiter: RateLimiter,
}

impl RoomCore {
    pub fn new(
        template: &str,
        version: u16,
        owner: ActorId,
        created_at: u64,
        config_blob: Vec<u8>,
        caps: RoomCaps,
        rate_limit: RateLimitConfig,
    ) -> Self {
        Self {
            info: RoomInfo {
                template: template.into(),
                version,
                owner,
                created_at,
                config_blob,
            },
            sequencer: EventSequencer::new(caps.event_capacity),
            caps,
            closed: false,
            membership: MembershipState::new(),
            rate_limiter: RateLimiter::new(rate_limit),
        }
    }

    pub fn owner(&self) -> ActorId {
        self.info.owner
    }

    pub fn is_closed(&self) -> bool {
        self.closed
    }

    pub fn info(&self) -> RoomInfo {
        self.info.clone()
    }

    pub fn seq(&self) -> u64 {
        self.sequencer.seq()
    }

    pub fn since(&self, from_seq: u64) -> SinceResult {
        self.sequencer.since(from_seq)
    }

    pub fn participants(&self) -> Vec<(ActorId, Profile)> {
        self.membership.participants()
    }

    pub fn is_participant(&self, actor: ActorId) -> bool {
        self.membership.participants.contains_key(&actor)
    }

    pub fn profile(&self, actor: ActorId) -> Option<&Profile> {
        self.membership.participants.get(&actor)
    }

    pub fn check_write(
        &mut self,
        caller: ActorId,
        payload_len: usize,
        now_secs: u64,
    ) -> Result<(), RoomError> {
        if self.closed {
            return Err(RoomError::Closed);
        }

        if payload_len > self.caps.max_payload_bytes as usize {
            return Err(RoomError::PayloadTooLarge {
                actual_bytes: payload_len as u32,
                max_bytes: self.caps.max_payload_bytes,
            });
        }

        if caller != self.owner() {
            self.rate_limiter.check_at(caller, now_secs)?;
        }

        Ok(())
    }

    pub fn join(
        &mut self,
        caller: ActorId,
        mut profile: Profile,
        payload_len: usize,
        now_secs: u64,
    ) -> Result<u64, RoomError> {
        self.check_write(caller, payload_len, now_secs)?;

        if self.membership.participants.contains_key(&caller) {
            return Err(RoomError::AlreadyJoined);
        }

        if let Some(allowlist) = &self.membership.allowlist
            && !allowlist.contains(&caller)
        {
            return Err(RoomError::NotAllowed);
        }

        if let Some(max_participants) = self.membership.max_participants
            && self.membership.participants.len() >= max_participants as usize
        {
            return Err(RoomError::ParticipantsFull);
        }

        if let Some(name) = &profile.name
            && name.as_bytes().len() > self.caps.max_profile_name_bytes as usize
        {
            return Err(RoomError::NameTooLong {
                max_bytes: self.caps.max_profile_name_bytes,
            });
        }

        profile.joined_at = now_secs;
        self.membership.participants.insert(caller, profile);
        Ok(self.sequencer.next_seq())
    }

    pub fn leave(
        &mut self,
        caller: ActorId,
        payload_len: usize,
        now_secs: u64,
    ) -> Result<u64, RoomError> {
        self.check_write(caller, payload_len, now_secs)?;

        if self.membership.participants.remove(&caller).is_none() {
            return Err(RoomError::NotJoined);
        }

        Ok(self.sequencer.next_seq())
    }

    pub fn configure(
        &mut self,
        caller: ActorId,
        config_blob: Vec<u8>,
        now_secs: u64,
    ) -> Result<u64, RoomError> {
        self.check_write(caller, config_blob.len(), now_secs)?;
        if caller != self.owner() {
            return Err(RoomError::NotOwner);
        }

        self.info.config_blob = config_blob;
        Ok(self.sequencer.next_seq())
    }

    pub fn close_room(&mut self, caller: ActorId, now_secs: u64) -> Result<u64, RoomError> {
        self.check_write(caller, 0, now_secs)?;
        if caller != self.owner() {
            return Err(RoomError::NotOwner);
        }

        self.closed = true;
        Ok(self.sequencer.next_seq())
    }

    pub fn participant_write(
        &mut self,
        caller: ActorId,
        payload_len: usize,
        now_secs: u64,
    ) -> Result<u64, RoomError> {
        self.check_write(caller, payload_len, now_secs)?;
        if !self.membership.participants.contains_key(&caller) {
            return Err(RoomError::NotJoined);
        }

        Ok(self.sequencer.next_seq())
    }

    pub fn owner_write(
        &mut self,
        caller: ActorId,
        payload_len: usize,
        now_secs: u64,
    ) -> Result<u64, RoomError> {
        self.check_write(caller, payload_len, now_secs)?;
        if caller != self.owner() {
            return Err(RoomError::NotOwner);
        }

        Ok(self.sequencer.next_seq())
    }

    pub fn public_write(
        &mut self,
        caller: ActorId,
        payload_len: usize,
        now_secs: u64,
    ) -> Result<u64, RoomError> {
        self.check_write(caller, payload_len, now_secs)?;
        Ok(self.sequencer.next_seq())
    }

    pub fn record_event<T: Encode>(&mut self, seq: u64, event: &T) {
        self.sequencer.push(seq, event.encode());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn actor(id: u64) -> ActorId {
        id.into()
    }

    #[test]
    fn rate_limiter_refills_after_time() {
        let mut limiter = RateLimiter::new(RateLimitConfig {
            capacity: 2,
            refill_per_minute: 2,
        });
        let alice = actor(7);

        assert_eq!(limiter.check_at(alice, 0), Ok(()));
        assert_eq!(limiter.check_at(alice, 0), Ok(()));
        assert!(matches!(
            limiter.check_at(alice, 0),
            Err(RoomError::RateLimited { .. })
        ));

        assert_eq!(limiter.check_at(alice, 30), Ok(()));
        assert!(matches!(
            limiter.check_at(alice, 30),
            Err(RoomError::RateLimited { .. })
        ));
        assert_eq!(limiter.check_at(alice, 60), Ok(()));
    }

    #[test]
    fn sequencer_reports_truncation() {
        let mut sequencer = EventSequencer::new(2);
        let seq1 = sequencer.next_seq();
        sequencer.push(seq1, vec![1]);
        let seq2 = sequencer.next_seq();
        sequencer.push(seq2, vec![2]);
        let seq3 = sequencer.next_seq();
        sequencer.push(seq3, vec![3]);

        let result = sequencer.since(0);
        assert_eq!(result.seq, 3);
        assert!(result.truncated);
        assert_eq!(result.events.len(), 2);
        assert_eq!(result.events[0].0, 2);
        assert_eq!(result.events[1].0, 3);
    }

    #[test]
    fn room_core_tracks_membership() {
        let mut room = RoomCore::new(
            "canvas",
            1,
            actor(1),
            10,
            vec![0xaa],
            RoomCaps::default(),
            RateLimitConfig::default(),
        );

        let seq = room
            .join(
                actor(2),
                Profile {
                    name: Some("alice".into()),
                    kind: ParticipantKind::Human,
                    joined_at: 0,
                },
                0,
                12,
            )
            .unwrap();

        assert_eq!(seq, 1);
        assert_eq!(room.seq(), 1);
        assert!(room.is_participant(actor(2)));
        assert_eq!(room.profile(actor(2)).unwrap().joined_at, 12);
    }
}

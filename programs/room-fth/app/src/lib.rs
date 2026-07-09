#![no_std]

use gearbase_core::{
    ParticipantKind, Profile, RateLimitConfig, RoomCaps, RoomCore, RoomError,
};
use sails_rs::{cell::RefCell, prelude::*};
use tiny_keccak::{Hasher, Keccak};

const PROGRAM_VERSION: u16 = 1;
const MAX_SEATS: usize = 5;
const MAX_ROUNDS: u16 = 5;
const MAX_ANSWER_BYTES: u16 = 280;

type RoomInfoView = (String, u16, ActorId, u64, Vec<u8>);
type SinceView = (u64, Vec<(u64, Vec<u8>)>, bool);
type ParticipantView = (ActorId, String, u16, u64);
type SeatView = (u16, ActorId);
type PromptView = (u16, String);
type AnswerView = (u16, u16, String);
type VoteView = (ActorId, u16);
type GameMetaView = (
    bool,
    u64,
    u16,
    u16,
    bool,
    [u8; 32],
    u16,
    u16,
    bool,
    u16,
    bool,
    u64,
);
type GameDataView = (
    Vec<SeatView>,
    Vec<PromptView>,
    Vec<AnswerView>,
    Vec<VoteView>,
    Vec<u32>,
);

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TypeInfo, ReflectHash)]
#[codec(crate = sails_rs::scale_codec)]
#[type_info(crate = sails_rs::type_info)]
#[reflect_hash(crate = sails_rs)]
pub struct FthConfig {
    pub reveal_tally_live: bool,
    pub reveal_timeout_secs: u64,
    pub round_count: u16,
    pub answer_max_bytes: u16,
}

impl FthConfig {
    fn validate(&self) -> Result<(), RoomError> {
        if self.round_count == 0 || self.round_count > MAX_ROUNDS {
            return Err(RoomError::InvalidConfig);
        }
        if self.answer_max_bytes == 0 || self.answer_max_bytes > MAX_ANSWER_BYTES {
            return Err(RoomError::InvalidConfig);
        }

        Ok(())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Encode, Decode, TypeInfo, ReflectHash)]
#[codec(crate = sails_rs::scale_codec)]
#[type_info(crate = sails_rs::type_info)]
#[reflect_hash(crate = sails_rs)]
pub enum FthPhase {
    Lobby,
    Answering,
    Voting,
    Ended,
    Aborted,
}

impl FthPhase {
    fn code(self) -> u16 {
        match self {
            Self::Lobby => 0,
            Self::Answering => 1,
            Self::Voting => 2,
            Self::Ended => 3,
            Self::Aborted => 4,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TypeInfo, ReflectHash)]
#[codec(crate = sails_rs::scale_codec)]
#[type_info(crate = sails_rs::type_info)]
#[reflect_hash(crate = sails_rs)]
pub struct RoundRecord {
    pub prompt: String,
    pub answers: collections::BTreeMap<u8, String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TypeInfo, ReflectHash)]
#[codec(crate = sails_rs::scale_codec)]
#[type_info(crate = sails_rs::type_info)]
#[reflect_hash(crate = sails_rs)]
pub struct FthSnapshot {
    pub config: FthConfig,
    pub host_commit: Option<[u8; 32]>,
    pub phase: FthPhase,
    pub seats: Vec<(u8, ActorId)>,
    pub rounds: Vec<RoundRecord>,
    pub votes: Vec<(ActorId, u8)>,
    pub tally: Vec<u32>,
    pub revealed_human_seat: Option<u8>,
    pub voting_started_at: Option<u64>,
}

type GameView = (GameMetaView, GameDataView);

#[event]
#[derive(Clone, Debug, PartialEq, Eq, Encode, TypeInfo, ReflectHash)]
#[codec(crate = sails_rs::scale_codec)]
#[type_info(crate = sails_rs::type_info)]
#[reflect_hash(crate = sails_rs)]
pub enum FthRoomEvent {
    Joined([u8; 32]),
    Left([u8; 32]),
    Updated(u64),
    Closed,
    Configured(u64),
    SatDown { who: [u8; 32], seat: u16 },
    HostCommitted,
    RoundStarted { round: u16, prompt: String },
    AnswerSubmitted {
        round: u16,
        seat: u16,
        who: [u8; 32],
        text: String,
    },
    VotingOpened,
    VoteCast { who: [u8; 32], seat: u16 },
    Revealed { seat: u16 },
    RevealAborted,
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

fn seat_index(seat: u16) -> Result<usize, RoomError> {
    let index = usize::from(seat);
    if index >= MAX_SEATS {
        return Err(RoomError::InvalidBounds);
    }

    Ok(index)
}

fn phase_required(actual: FthPhase, expected: FthPhase) -> Result<(), RoomError> {
    if actual != expected {
        return Err(RoomError::WrongPhase);
    }

    Ok(())
}

fn commit_hash(seat: u8, salt: [u8; 32]) -> [u8; 32] {
    let mut hasher = Keccak::v256();
    let mut output = [0u8; 32];
    hasher.update(&[seat]);
    hasher.update(&salt);
    hasher.finalize(&mut output);
    output
}

pub struct FthState {
    room: RoomCore,
    config: FthConfig,
    host_commit: Option<[u8; 32]>,
    phase: FthPhase,
    seats: [Option<ActorId>; MAX_SEATS],
    seated_by_actor: collections::BTreeMap<ActorId, u8>,
    rounds: Vec<RoundRecord>,
    votes: collections::BTreeMap<ActorId, u8>,
    tally: Vec<u32>,
    revealed_human_seat: Option<u8>,
    voting_started_at: Option<u64>,
}

impl FthState {
    fn new(owner: ActorId, config: FthConfig, created_at: u64) -> Result<Self, RoomError> {
        config.validate()?;

        Ok(Self {
            room: RoomCore::new(
                "fth",
                PROGRAM_VERSION,
                owner,
                created_at,
                config.encode(),
                RoomCaps::default(),
                RateLimitConfig::default(),
            ),
            config,
            host_commit: None,
            phase: FthPhase::Lobby,
            seats: [None; MAX_SEATS],
            seated_by_actor: collections::BTreeMap::new(),
            rounds: Vec::new(),
            votes: collections::BTreeMap::new(),
            tally: vec![0; MAX_SEATS],
            revealed_human_seat: None,
            voting_started_at: None,
        })
    }

    fn snapshot(&self) -> Vec<u8> {
        FthSnapshot {
            config: self.config.clone(),
            host_commit: self.host_commit,
            phase: self.phase,
            seats: self
                .seats
                .iter()
                .enumerate()
                .filter_map(|(seat, who)| who.map(|actor| (seat as u8, actor)))
                .collect(),
            rounds: self.rounds.clone(),
            votes: self.votes.iter().map(|(actor, seat)| (*actor, *seat)).collect(),
            tally: self.tally.clone(),
            revealed_human_seat: self.revealed_human_seat,
            voting_started_at: self.voting_started_at,
        }
        .encode()
    }

    fn game_view(&self) -> GameView {
        let commit = self.host_commit.unwrap_or([0; 32]);
        let prompts = self
            .rounds
            .iter()
            .enumerate()
            .map(|(round, record)| (round as u16, record.prompt.clone()))
            .collect();
        let mut answers = Vec::new();
        for (round, record) in self.rounds.iter().enumerate() {
            for (seat, text) in &record.answers {
                answers.push((round as u16, u16::from(*seat), text.clone()));
            }
        }

        (
            (
                self.config.reveal_tally_live,
                self.config.reveal_timeout_secs,
                self.config.round_count,
                self.config.answer_max_bytes,
                self.host_commit.is_some(),
                commit,
                self.phase.code(),
                self.rounds.len() as u16,
                self.revealed_human_seat.is_some(),
                u16::from(self.revealed_human_seat.unwrap_or_default()),
                self.voting_started_at.is_some(),
                self.voting_started_at.unwrap_or_default(),
            ),
            (
                self.seats
                    .iter()
                    .enumerate()
                    .filter_map(|(seat, who)| who.map(|actor| (seat as u16, actor)))
                    .collect(),
                prompts,
                answers,
                self.votes
                    .iter()
                    .map(|(actor, seat)| (*actor, u16::from(*seat)))
                    .collect(),
                self.tally.clone(),
            ),
        )
    }

    fn all_seats_filled(&self) -> bool {
        self.seats.iter().all(Option::is_some)
    }

    fn seat_of(&self, actor: ActorId) -> Option<u8> {
        self.seated_by_actor.get(&actor).copied()
    }

    fn current_round_mut(&mut self) -> Result<&mut RoundRecord, RoomError> {
        self.rounds.last_mut().ok_or(RoomError::WrongPhase)
    }
}

pub struct FthRoomService<'a> {
    state: &'a RefCell<FthState>,
}

impl<'a> FthRoomService<'a> {
    pub fn new(state: &'a RefCell<FthState>) -> Self {
        Self { state }
    }
}

#[service(events = FthRoomEvent)]
impl FthRoomService<'_> {
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

        let joined = FthRoomEvent::Joined(caller.into_bytes());
        let updated = FthRoomEvent::Updated(seq);
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
        let seq = {
            let mut state = self.state.borrow_mut();
            let seq = state.room.leave(caller, 0, now)?;
            if let Some(seat) = state.seated_by_actor.remove(&caller) {
                state.seats[usize::from(seat)] = None;
            }
            seq
        };

        let left = FthRoomEvent::Left(caller.into_bytes());
        let updated = FthRoomEvent::Updated(seq);
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
            FthConfig::decode(&mut &config_blob[..]).map_err(|_| RoomError::InvalidConfig)?;
        new_config.validate()?;

        {
            let state = self.state.borrow();
            phase_required(state.phase, FthPhase::Lobby)?;
            if !state.rounds.is_empty() {
                return Err(RoomError::WrongPhase);
            }
        }

        let seq = {
            let mut state = self.state.borrow_mut();
            let seq = state.room.configure(caller, config_blob, now)?;
            state.config = new_config;
            seq
        };

        let configured = FthRoomEvent::Configured(seq);
        let updated = FthRoomEvent::Updated(seq);
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

        let closed = FthRoomEvent::Closed;
        let updated = FthRoomEvent::Updated(seq);
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
    pub fn sit_down(&mut self, seat: u16) -> Result<u64, RoomError> {
        let caller = Syscall::message_source();
        let now = Syscall::block_timestamp();
        let payload_len = seat.encode().len();
        let seat_index = seat_index(seat)?;

        let seq = {
            let mut state = self.state.borrow_mut();
            phase_required(state.phase, FthPhase::Lobby)?;
            let seq = state.room.participant_write(caller, payload_len, now)?;
            if state.seat_of(caller).is_some() {
                return Err(RoomError::AlreadySeated);
            }
            if state.seats[seat_index].is_some() {
                return Err(RoomError::SeatOccupied);
            }
            state.seats[seat_index] = Some(caller);
            state.seated_by_actor.insert(caller, seat as u8);
            seq
        };

        let seated = FthRoomEvent::SatDown {
            who: caller.into_bytes(),
            seat,
        };
        let updated = FthRoomEvent::Updated(seq);
        {
            let mut state = self.state.borrow_mut();
            state.room.record_event(seq, &seated);
            state.room.record_event(seq, &updated);
        }
        self.emit_event(seated).expect("failed to emit seat event");
        self.emit_event(updated)
            .expect("failed to emit updated event");

        Ok(seq)
    }

    #[export(unwrap_result)]
    pub fn host_commit(&mut self, hash: [u8; 32]) -> Result<u64, RoomError> {
        let caller = Syscall::message_source();
        let now = Syscall::block_timestamp();
        let seq = {
            let mut state = self.state.borrow_mut();
            phase_required(state.phase, FthPhase::Lobby)?;
            let seq = state.room.owner_write(caller, hash.len(), now)?;
            state.host_commit = Some(hash);
            seq
        };

        let committed = FthRoomEvent::HostCommitted;
        let updated = FthRoomEvent::Updated(seq);
        {
            let mut state = self.state.borrow_mut();
            state.room.record_event(seq, &committed);
            state.room.record_event(seq, &updated);
        }
        self.emit_event(committed)
            .expect("failed to emit host commit event");
        self.emit_event(updated)
            .expect("failed to emit updated event");

        Ok(seq)
    }

    #[export(unwrap_result)]
    pub fn start_round(&mut self, prompt: String) -> Result<u64, RoomError> {
        let caller = Syscall::message_source();
        let now = Syscall::block_timestamp();
        if prompt.trim().is_empty() {
            return Err(RoomError::InvalidConfig);
        }

        let seq = {
            let mut state = self.state.borrow_mut();
            let seq = state.room.owner_write(caller, prompt.as_bytes().len(), now)?;
            match state.phase {
                FthPhase::Lobby => {
                    if state.host_commit.is_none() || !state.all_seats_filled() {
                        return Err(RoomError::InvalidConfig);
                    }
                }
                FthPhase::Answering => {
                    if state.rounds.len() as u16 >= state.config.round_count {
                        return Err(RoomError::WrongPhase);
                    }
                }
                _ => return Err(RoomError::WrongPhase),
            }

            state.rounds.push(RoundRecord {
                prompt: prompt.clone(),
                answers: collections::BTreeMap::new(),
            });
            state.phase = FthPhase::Answering;
            seq
        };

        let round_number = self.state.borrow().rounds.len() as u16;
        let started = FthRoomEvent::RoundStarted {
            round: round_number,
            prompt,
        };
        let updated = FthRoomEvent::Updated(seq);
        {
            let mut state = self.state.borrow_mut();
            state.room.record_event(seq, &started);
            state.room.record_event(seq, &updated);
        }
        self.emit_event(started)
            .expect("failed to emit round started event");
        self.emit_event(updated)
            .expect("failed to emit updated event");

        Ok(seq)
    }

    #[export(unwrap_result)]
    pub fn submit_answer(&mut self, text: String) -> Result<u64, RoomError> {
        let caller = Syscall::message_source();
        let now = Syscall::block_timestamp();
        let answer_len = text.as_bytes().len();

        let (seq, seat, round_index) = {
            let mut state = self.state.borrow_mut();
            phase_required(state.phase, FthPhase::Answering)?;
            if answer_len > state.config.answer_max_bytes as usize {
                return Err(RoomError::PayloadTooLarge {
                    actual_bytes: answer_len as u32,
                    max_bytes: state.config.answer_max_bytes,
                });
            }
            let seat = state.seat_of(caller).ok_or(RoomError::NotAllowed)?;
            let seq = state.room.participant_write(caller, answer_len, now)?;
            let round_index = state.rounds.len().saturating_sub(1);
            let round = state.current_round_mut()?;
            if round.answers.contains_key(&seat) {
                return Err(RoomError::InvalidConfig);
            }
            round.answers.insert(seat, text.clone());
            (seq, seat, round_index as u16)
        };

        let answered = FthRoomEvent::AnswerSubmitted {
            round: round_index + 1,
            seat: u16::from(seat),
            who: caller.into_bytes(),
            text,
        };
        let updated = FthRoomEvent::Updated(seq);
        {
            let mut state = self.state.borrow_mut();
            state.room.record_event(seq, &answered);
            state.room.record_event(seq, &updated);
        }
        self.emit_event(answered)
            .expect("failed to emit answer event");
        self.emit_event(updated)
            .expect("failed to emit updated event");

        Ok(seq)
    }

    #[export(unwrap_result)]
    pub fn open_voting(&mut self) -> Result<u64, RoomError> {
        let caller = Syscall::message_source();
        let now = Syscall::block_timestamp();
        let seq = {
            let mut state = self.state.borrow_mut();
            phase_required(state.phase, FthPhase::Answering)?;
            if state.rounds.len() as u16 != state.config.round_count {
                return Err(RoomError::WrongPhase);
            }
            let seq = state.room.owner_write(caller, 0, now)?;
            state.phase = FthPhase::Voting;
            state.voting_started_at = Some(now);
            state.votes.clear();
            state.tally.fill(0);
            seq
        };

        let opened = FthRoomEvent::VotingOpened;
        let updated = FthRoomEvent::Updated(seq);
        {
            let mut state = self.state.borrow_mut();
            state.room.record_event(seq, &opened);
            state.room.record_event(seq, &updated);
        }
        self.emit_event(opened)
            .expect("failed to emit voting event");
        self.emit_event(updated)
            .expect("failed to emit updated event");

        Ok(seq)
    }

    #[export(unwrap_result)]
    pub fn cast_vote(&mut self, seat: u16) -> Result<u64, RoomError> {
        let caller = Syscall::message_source();
        let now = Syscall::block_timestamp();
        let payload_len = seat.encode().len();
        let seat_index = seat_index(seat)?;

        let seq = {
            let mut state = self.state.borrow_mut();
            phase_required(state.phase, FthPhase::Voting)?;
            let seq = state.room.participant_write(caller, payload_len, now)?;
            if state.seat_of(caller).is_some() {
                return Err(RoomError::NotAllowed);
            }
            if state.votes.contains_key(&caller) {
                return Err(RoomError::AlreadyVoted);
            }
            state.votes.insert(caller, seat as u8);
            state.tally[seat_index] = state.tally[seat_index].saturating_add(1);
            seq
        };

        let cast = FthRoomEvent::VoteCast {
            who: caller.into_bytes(),
            seat,
        };
        let updated = FthRoomEvent::Updated(seq);
        {
            let mut state = self.state.borrow_mut();
            state.room.record_event(seq, &cast);
            state.room.record_event(seq, &updated);
        }
        self.emit_event(cast).expect("failed to emit vote cast event");
        self.emit_event(updated)
            .expect("failed to emit updated event");

        Ok(seq)
    }

    #[export(unwrap_result)]
    pub fn reveal(&mut self, seat: u16, salt: [u8; 32]) -> Result<u64, RoomError> {
        let caller = Syscall::message_source();
        let now = Syscall::block_timestamp();
        let seat_index = seat_index(seat)?;
        let payload_len = seat.encode().len() + salt.len();

        let seq = {
            let mut state = self.state.borrow_mut();
            phase_required(state.phase, FthPhase::Voting)?;
            let seq = state.room.owner_write(caller, payload_len, now)?;
            let expected = state.host_commit.ok_or(RoomError::InvalidConfig)?;
            if expected != commit_hash(seat as u8, salt) {
                return Err(RoomError::CommitMismatch);
            }
            if state.seats[seat_index].is_none() {
                return Err(RoomError::InvalidBounds);
            }
            state.revealed_human_seat = Some(seat as u8);
            state.phase = FthPhase::Ended;
            seq
        };

        let revealed = FthRoomEvent::Revealed { seat };
        let updated = FthRoomEvent::Updated(seq);
        {
            let mut state = self.state.borrow_mut();
            state.room.record_event(seq, &revealed);
            state.room.record_event(seq, &updated);
        }
        self.emit_event(revealed)
            .expect("failed to emit reveal event");
        self.emit_event(updated)
            .expect("failed to emit updated event");

        Ok(seq)
    }

    #[export(unwrap_result)]
    pub fn abort_reveal(&mut self) -> Result<u64, RoomError> {
        let caller = Syscall::message_source();
        let now = Syscall::block_timestamp();
        let seq = {
            let mut state = self.state.borrow_mut();
            phase_required(state.phase, FthPhase::Voting)?;
            let voting_started_at = state.voting_started_at.ok_or(RoomError::WrongPhase)?;
            let deadline = voting_started_at.saturating_add(state.config.reveal_timeout_secs);
            if now < deadline {
                return Err(RoomError::RevealTimeoutPending {
                    remaining_secs: (deadline - now) as u32,
                });
            }
            let seq = state.room.public_write(caller, 0, now)?;
            state.phase = FthPhase::Aborted;
            seq
        };

        let aborted = FthRoomEvent::RevealAborted;
        let updated = FthRoomEvent::Updated(seq);
        {
            let mut state = self.state.borrow_mut();
            state.room.record_event(seq, &aborted);
            state.room.record_event(seq, &updated);
        }
        self.emit_event(aborted)
            .expect("failed to emit abort event");
        self.emit_event(updated)
            .expect("failed to emit updated event");

        Ok(seq)
    }

    #[export]
    pub fn game(&self) -> GameView {
        self.state.borrow().game_view()
    }
}

pub struct Program {
    state: RefCell<FthState>,
}

#[program]
impl Program {
    pub fn create(
        reveal_tally_live: bool,
        reveal_timeout_secs: u64,
        round_count: u16,
        answer_max_bytes: u16,
    ) -> Self {
        let owner = Syscall::message_source();
        let created_at = Syscall::block_timestamp();
        let config = FthConfig {
            reveal_tally_live,
            reveal_timeout_secs,
            round_count,
            answer_max_bytes,
        };
        let state =
            FthState::new(owner, config, created_at).expect("invalid fth configuration");
        Self {
            state: RefCell::new(state),
        }
    }

    pub fn room(&self) -> FthRoomService<'_> {
        FthRoomService::new(&self.state)
    }
}

use room_fth_client::{room::*, RoomFthClient as _, RoomFthClientCtors as _};
use sails_rs::{client::*, gtest::*, prelude::*};
use tiny_keccak::{Hasher, Keccak};

const OWNER_ID: u64 = 42;
const PLAYER_ONE_ID: u64 = 77;
const PLAYER_TWO_ID: u64 = 78;
const PLAYER_THREE_ID: u64 = 79;
const PLAYER_FOUR_ID: u64 = 80;
const PLAYER_FIVE_ID: u64 = 81;
const SPECTATOR_ID: u64 = 82;

#[tokio::test]
async fn fth_room_runs_rounds_votes_and_reveal() {
    let (env, code_id) = create_env();
    let program = env
        .deploy::<room_fth_client::RoomFthClientProgram>(code_id, b"fth-main".to_vec())
        .create(false, 1, 2, 280)
        .await
        .unwrap();
    let program_id = program.id();

    let mut host = program.room();
    let mut player_one = Actor::<room_fth_client::RoomFthClientProgram, _>::new(
        env.clone().with_actor_id(PLAYER_ONE_ID.into()),
        program_id,
    )
    .room();
    let mut player_two = Actor::<room_fth_client::RoomFthClientProgram, _>::new(
        env.clone().with_actor_id(PLAYER_TWO_ID.into()),
        program_id,
    )
    .room();
    let mut player_three = Actor::<room_fth_client::RoomFthClientProgram, _>::new(
        env.clone().with_actor_id(PLAYER_THREE_ID.into()),
        program_id,
    )
    .room();
    let mut player_four = Actor::<room_fth_client::RoomFthClientProgram, _>::new(
        env.clone().with_actor_id(PLAYER_FOUR_ID.into()),
        program_id,
    )
    .room();
    let mut player_five = Actor::<room_fth_client::RoomFthClientProgram, _>::new(
        env.clone().with_actor_id(PLAYER_FIVE_ID.into()),
        program_id,
    )
    .room();
    let mut spectator = Actor::<room_fth_client::RoomFthClientProgram, _>::new(
        env.clone().with_actor_id(SPECTATOR_ID.into()),
        program_id,
    )
    .room();

    let _: sails_rs::Result<u64, RoomError> = host.join("host".into(), 1).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> = player_one.join("one".into(), 1).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> = player_two.join("two".into(), 1).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> = player_three.join("three".into(), 1).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> = player_four.join("four".into(), 1).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> = player_five.join("five".into(), 1).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> = spectator.join("spec".into(), 1).await.unwrap();

    let _: sails_rs::Result<u64, RoomError> = player_one.sit_down(0).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> = player_two.sit_down(1).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> = player_three.sit_down(2).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> = player_four.sit_down(3).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> = player_five.sit_down(4).await.unwrap();

    let salt = [7u8; 32];
    let commit = build_commit(2, salt);
    let _: sails_rs::Result<u64, RoomError> = host.host_commit(commit).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> =
        host.start_round("First tell".into()).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> =
        player_one.submit_answer("one".into()).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> =
        player_two.submit_answer("two".into()).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> =
        player_three.submit_answer("three".into()).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> =
        player_four.submit_answer("four".into()).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> =
        player_five.submit_answer("five".into()).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> =
        host.start_round("Second tell".into()).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> =
        player_one.submit_answer("alpha".into()).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> =
        player_two.submit_answer("beta".into()).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> =
        player_three.submit_answer("gamma".into()).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> =
        player_four.submit_answer("delta".into()).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> =
        player_five.submit_answer("epsilon".into()).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> = host.open_voting().await.unwrap();
    let _: sails_rs::Result<u64, RoomError> = spectator.cast_vote(2).await.unwrap();
    let revealed: sails_rs::Result<u64, RoomError> = host.reveal(2, salt).await.unwrap();

    let game = spectator.game().await.unwrap();
    let since = spectator.since(0).await.unwrap();

    assert_eq!(revealed, Ok(28));
    assert_eq!(game.0.6, 3);
    assert_eq!(game.0.7, 2);
    assert_eq!(game.0.8, true);
    assert_eq!(game.0.9, 2);
    assert_eq!(game.1.0.len(), 5);
    assert_eq!(game.1.1.len(), 2);
    assert_eq!(game.1.2.len(), 10);
    assert_eq!(game.1.4, vec![0, 0, 1, 0, 0]);
    assert_eq!(since.0, 28);
    assert!(!since.1.is_empty());
}

#[tokio::test]
async fn fth_room_aborts_reveal_after_timeout() {
    let (env, code_id) = create_env();
    let program = env
        .deploy::<room_fth_client::RoomFthClientProgram>(code_id, b"fth-abort".to_vec())
        .create(false, 0, 1, 280)
        .await
        .unwrap();
    let program_id = program.id();

    let mut host = program.room();
    let mut player_one = Actor::<room_fth_client::RoomFthClientProgram, _>::new(
        env.clone().with_actor_id(PLAYER_ONE_ID.into()),
        program_id,
    )
    .room();
    let mut player_two = Actor::<room_fth_client::RoomFthClientProgram, _>::new(
        env.clone().with_actor_id(PLAYER_TWO_ID.into()),
        program_id,
    )
    .room();
    let mut player_three = Actor::<room_fth_client::RoomFthClientProgram, _>::new(
        env.clone().with_actor_id(PLAYER_THREE_ID.into()),
        program_id,
    )
    .room();
    let mut player_four = Actor::<room_fth_client::RoomFthClientProgram, _>::new(
        env.clone().with_actor_id(PLAYER_FOUR_ID.into()),
        program_id,
    )
    .room();
    let mut player_five = Actor::<room_fth_client::RoomFthClientProgram, _>::new(
        env.clone().with_actor_id(PLAYER_FIVE_ID.into()),
        program_id,
    )
    .room();
    let mut spectator = Actor::<room_fth_client::RoomFthClientProgram, _>::new(
        env.clone().with_actor_id(SPECTATOR_ID.into()),
        program_id,
    )
    .room();

    let _: sails_rs::Result<u64, RoomError> = host.join("host".into(), 1).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> = player_one.join("one".into(), 1).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> = player_two.join("two".into(), 1).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> = player_three.join("three".into(), 1).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> = player_four.join("four".into(), 1).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> = player_five.join("five".into(), 1).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> = spectator.join("spec".into(), 1).await.unwrap();

    let _: sails_rs::Result<u64, RoomError> = player_one.sit_down(0).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> = player_two.sit_down(1).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> = player_three.sit_down(2).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> = player_four.sit_down(3).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> = player_five.sit_down(4).await.unwrap();

    let _: sails_rs::Result<u64, RoomError> =
        host.host_commit(build_commit(1, [9u8; 32])).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> =
        host.start_round("Only round".into()).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> = host.open_voting().await.unwrap();

    let aborted: sails_rs::Result<u64, RoomError> = spectator.abort_reveal().await.unwrap();
    assert_eq!(aborted, Ok(16));

    let game = spectator.game().await.unwrap();
    assert_eq!(game.0.6, 4);
}

#[tokio::test]
async fn fth_room_rejects_double_join() {
    let (env, code_id) = create_env();
    let program = env
        .deploy::<room_fth_client::RoomFthClientProgram>(code_id, b"fth-double-join".to_vec())
        .create(false, 1, 2, 280)
        .await
        .unwrap();

    let mut host = program.room();
    let first: sails_rs::Result<u64, RoomError> = host.join("host".into(), 1).await.unwrap();
    assert_eq!(first, Ok(1));

    let second: sails_rs::Result<u64, RoomError> = host.join("host".into(), 1).await.unwrap();
    assert!(matches!(second, Err(RoomError::AlreadyJoined)));
}

#[tokio::test]
async fn fth_room_rejects_leave_without_join() {
    let (env, code_id) = create_env();
    let program = env
        .deploy::<room_fth_client::RoomFthClientProgram>(code_id, b"fth-leave-unjoined".to_vec())
        .create(false, 1, 2, 280)
        .await
        .unwrap();

    let mut host = program.room();
    let res: sails_rs::Result<u64, RoomError> = host.leave().await.unwrap();
    assert!(matches!(res, Err(RoomError::NotJoined)));
}

#[tokio::test]
async fn fth_room_rejects_configure_by_non_owner() {
    let (env, code_id) = create_env();
    let program = env
        .deploy::<room_fth_client::RoomFthClientProgram>(code_id, b"fth-configure-not-owner".to_vec())
        .create(false, 1, 2, 280)
        .await
        .unwrap();
    let program_id = program.id();

    let config = room_fth_app::FthConfig {
        reveal_tally_live: false,
        reveal_timeout_secs: 1,
        round_count: 2,
        answer_max_bytes: 280,
    };
    let mut player = Actor::<room_fth_client::RoomFthClientProgram, _>::new(
        env.clone().with_actor_id(PLAYER_ONE_ID.into()),
        program_id,
    )
    .room();
    let res: sails_rs::Result<u64, RoomError> = player.configure(config.encode()).await.unwrap();
    assert!(matches!(res, Err(RoomError::NotOwner)));
}

#[tokio::test]
async fn fth_room_rejects_close_by_non_owner() {
    let (env, code_id) = create_env();
    let program = env
        .deploy::<room_fth_client::RoomFthClientProgram>(code_id, b"fth-close-not-owner".to_vec())
        .create(false, 1, 2, 280)
        .await
        .unwrap();
    let program_id = program.id();

    let mut player = Actor::<room_fth_client::RoomFthClientProgram, _>::new(
        env.clone().with_actor_id(PLAYER_ONE_ID.into()),
        program_id,
    )
    .room();
    let res: sails_rs::Result<u64, RoomError> = player.close_room().await.unwrap();
    assert!(matches!(res, Err(RoomError::NotOwner)));
}

#[tokio::test]
async fn fth_room_rejects_sit_on_occupied_seat() {
    let (env, code_id) = create_env();
    let program = env
        .deploy::<room_fth_client::RoomFthClientProgram>(code_id, b"fth-seat-occupied".to_vec())
        .create(false, 1, 2, 280)
        .await
        .unwrap();
    let program_id = program.id();

    let mut player_one = Actor::<room_fth_client::RoomFthClientProgram, _>::new(
        env.clone().with_actor_id(PLAYER_ONE_ID.into()),
        program_id,
    )
    .room();
    let mut player_two = Actor::<room_fth_client::RoomFthClientProgram, _>::new(
        env.clone().with_actor_id(PLAYER_TWO_ID.into()),
        program_id,
    )
    .room();

    let _: sails_rs::Result<u64, RoomError> = player_one.join("one".into(), 1).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> = player_two.join("two".into(), 1).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> = player_one.sit_down(0).await.unwrap();

    let res: sails_rs::Result<u64, RoomError> = player_two.sit_down(0).await.unwrap();
    assert!(matches!(res, Err(RoomError::SeatOccupied)));
}

#[tokio::test]
async fn fth_room_rejects_host_commit_by_non_owner() {
    let (env, code_id) = create_env();
    let program = env
        .deploy::<room_fth_client::RoomFthClientProgram>(code_id, b"fth-commit-not-owner".to_vec())
        .create(false, 1, 2, 280)
        .await
        .unwrap();
    let program_id = program.id();

    let mut player = Actor::<room_fth_client::RoomFthClientProgram, _>::new(
        env.clone().with_actor_id(PLAYER_ONE_ID.into()),
        program_id,
    )
    .room();
    let res: sails_rs::Result<u64, RoomError> = player.host_commit([0u8; 32]).await.unwrap();
    assert!(matches!(res, Err(RoomError::NotOwner)));
}

#[tokio::test]
async fn fth_room_rejects_start_round_by_non_owner() {
    let (env, code_id) = create_env();
    let program = env
        .deploy::<room_fth_client::RoomFthClientProgram>(code_id, b"fth-start-not-owner".to_vec())
        .create(false, 1, 2, 280)
        .await
        .unwrap();
    let program_id = program.id();

    let mut player = Actor::<room_fth_client::RoomFthClientProgram, _>::new(
        env.clone().with_actor_id(PLAYER_ONE_ID.into()),
        program_id,
    )
    .room();
    let res: sails_rs::Result<u64, RoomError> = player.start_round("prompt".into()).await.unwrap();
    assert!(matches!(res, Err(RoomError::NotOwner)));
}

#[tokio::test]
async fn fth_room_rejects_submit_answer_wrong_phase() {
    let (env, code_id) = create_env();
    let program = env
        .deploy::<room_fth_client::RoomFthClientProgram>(code_id, b"fth-answer-phase".to_vec())
        .create(false, 1, 2, 280)
        .await
        .unwrap();

    // Still in Lobby, so answering is not allowed.
    let mut host = program.room();
    let res: sails_rs::Result<u64, RoomError> = host.submit_answer("nope".into()).await.unwrap();
    assert!(matches!(res, Err(RoomError::WrongPhase)));
}

#[tokio::test]
async fn fth_room_rejects_open_voting_wrong_phase() {
    let (env, code_id) = create_env();
    let program = env
        .deploy::<room_fth_client::RoomFthClientProgram>(code_id, b"fth-open-phase".to_vec())
        .create(false, 1, 2, 280)
        .await
        .unwrap();

    let mut host = program.room();
    let res: sails_rs::Result<u64, RoomError> = host.open_voting().await.unwrap();
    assert!(matches!(res, Err(RoomError::WrongPhase)));
}

#[tokio::test]
async fn fth_room_rejects_cast_vote_wrong_phase() {
    let (env, code_id) = create_env();
    let program = env
        .deploy::<room_fth_client::RoomFthClientProgram>(code_id, b"fth-cast-phase".to_vec())
        .create(false, 1, 2, 280)
        .await
        .unwrap();

    // seat 0 is in bounds, so the phase gate is what rejects.
    let mut host = program.room();
    let res: sails_rs::Result<u64, RoomError> = host.cast_vote(0).await.unwrap();
    assert!(matches!(res, Err(RoomError::WrongPhase)));
}

#[tokio::test]
async fn fth_room_rejects_reveal_wrong_phase() {
    let (env, code_id) = create_env();
    let program = env
        .deploy::<room_fth_client::RoomFthClientProgram>(code_id, b"fth-reveal-phase".to_vec())
        .create(false, 1, 2, 280)
        .await
        .unwrap();

    let mut host = program.room();
    let res: sails_rs::Result<u64, RoomError> = host.reveal(0, [0u8; 32]).await.unwrap();
    assert!(matches!(res, Err(RoomError::WrongPhase)));
}

#[tokio::test]
async fn fth_room_rejects_abort_reveal_wrong_phase() {
    let (env, code_id) = create_env();
    let program = env
        .deploy::<room_fth_client::RoomFthClientProgram>(code_id, b"fth-abort-phase".to_vec())
        .create(false, 1, 2, 280)
        .await
        .unwrap();

    let mut host = program.room();
    let res: sails_rs::Result<u64, RoomError> = host.abort_reveal().await.unwrap();
    assert!(matches!(res, Err(RoomError::WrongPhase)));
}

fn create_env() -> (GtestEnv, CodeId) {
    let system = System::new();
    system.init_logger_with_default_filter("gwasm=debug,gtest=info,sails_rs=debug");
    for actor in [
        OWNER_ID,
        PLAYER_ONE_ID,
        PLAYER_TWO_ID,
        PLAYER_THREE_ID,
        PLAYER_FOUR_ID,
        PLAYER_FIVE_ID,
        SPECTATOR_ID,
    ] {
        system.mint_to(actor, 1_000_000_000_000_000);
    }
    let code_id = system.submit_code(::room_fth::WASM_BINARY);
    let env = GtestEnv::new(system, OWNER_ID.into());
    (env, code_id)
}

fn build_commit(seat: u8, salt: [u8; 32]) -> [u8; 32] {
    let mut output = [0u8; 32];
    let mut hasher = Keccak::v256();
    hasher.update(&[seat]);
    hasher.update(&salt);
    hasher.finalize(&mut output);
    output
}

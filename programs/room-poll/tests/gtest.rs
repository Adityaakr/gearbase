use room_poll_client::{room::*, RoomPollClient as _, RoomPollClientCtors as _};
use sails_rs::{client::*, gtest::*, prelude::*};

const OWNER_ID: u64 = 42;
const ALICE_ID: u64 = 77;

#[tokio::test]
async fn poll_room_tracks_votes_and_revotes() {
    let (env, code_id) = create_env();
    let program = env
        .deploy::<room_poll_client::RoomPollClientProgram>(code_id, b"poll-salt".to_vec())
        .create(
            "Best builder?".into(),
            vec!["Alice".into(), "Bob".into(), "Cara".into()],
            false,
            0,
        )
        .await
        .unwrap();

    let alice_env = env.clone().with_actor_id(ALICE_ID.into());
    let mut owner_room = program.room();
    let mut alice_room = program.with_env(&alice_env).room();

    let _: sails_rs::Result<u64, RoomError> = owner_room.join("owner".into(), 1).await.unwrap();
    let _: sails_rs::Result<u64, RoomError> = alice_room.join("alice".into(), 1).await.unwrap();

    let first_vote: sails_rs::Result<u64, RoomError> = owner_room.vote(0).await.unwrap();
    let second_vote: sails_rs::Result<u64, RoomError> = alice_room.vote(1).await.unwrap();
    let revote: sails_rs::Result<u64, RoomError> = owner_room.vote(2).await.unwrap();

    let tally: Vec<u32> = alice_room.tally().await.unwrap();
    let poll = alice_room.poll().await.unwrap();
    let since = alice_room.since(0).await.unwrap();

    assert_eq!(first_vote, Ok(3));
    assert_eq!(second_vote, Ok(4));
    assert_eq!(revote, Ok(5));
    assert_eq!(tally, vec![0, 1, 1]);
    assert_eq!(poll.0, "Best builder?");
    assert_eq!(poll.1.len(), 3);
    assert_eq!(poll.4.len(), 2);
    assert_eq!(since.0, 5);
    assert_eq!(since.1.len(), 10);
    assert!(!since.2);
}

#[tokio::test]
async fn poll_room_rejects_invalid_option() {
    let (env, code_id) = create_env();
    let program = env
        .deploy::<room_poll_client::RoomPollClientProgram>(code_id, b"poll-invalid".to_vec())
        .create(
            "Pick one".into(),
            vec!["A".into(), "B".into()],
            false,
            0,
        )
        .await
        .unwrap();

    let alice_env = env.clone().with_actor_id(ALICE_ID.into());
    let mut room = program.with_env(&alice_env).room();
    let _: sails_rs::Result<u64, RoomError> = room.join(String::new(), 0).await.unwrap();

    let invalid: sails_rs::Result<u64, RoomError> = room.vote(2).await.unwrap();
    assert!(matches!(invalid, Err(RoomError::InvalidBounds)));
}

fn create_env() -> (GtestEnv, CodeId) {
    let system = System::new();
    system.init_logger_with_default_filter("gwasm=debug,gtest=info,sails_rs=debug");
    system.mint_to(OWNER_ID, 1_000_000_000_000_000);
    system.mint_to(ALICE_ID, 1_000_000_000_000_000);
    let code_id = system.submit_code(::room_poll::WASM_BINARY);
    let env = GtestEnv::new(system, OWNER_ID.into());
    (env, code_id)
}

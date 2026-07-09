use room_canvas_client::{room::*, RoomCanvasClient as _, RoomCanvasClientCtors as _};
use sails_rs::{client::*, gtest::*, prelude::*};

const OWNER_ID: u64 = 42;
const USER_ID: u64 = 77;

#[tokio::test]
async fn canvas_room_tracks_join_pixel_and_since() {
    let (env, code_id) = create_env();
    let program = env
        .deploy::<room_canvas_client::RoomCanvasClientProgram>(code_id, b"salt".to_vec())
        .create(8, 8, 16, 0)
        .await
        .unwrap();

    let user_env = env.clone().with_actor_id(USER_ID.into());
    let mut room = program.with_env(&user_env).room();

    let joined: sails_rs::Result<u64, RoomError> = room.join("alice".into(), 1).await.unwrap();
    assert_eq!(joined, Ok(1));

    let placed: sails_rs::Result<u64, RoomError> = room.place_pixel(3, 4, 7).await.unwrap();
    assert_eq!(placed, Ok(2));

    let seq: u64 = room.seq().await.unwrap();
    let participants: Vec<(ActorId, String, u16, u64)> = room.participants().await.unwrap();
    let region: sails_rs::Result<Vec<u8>, RoomError> = room.region(3, 4, 1, 1).await.unwrap();
    let since = room.since(0).await.unwrap();

    assert_eq!(seq, 2);
    assert_eq!(participants.len(), 1);
    assert_eq!(region, Ok(vec![7]));
    assert_eq!(since.0, 2);
    assert_eq!(since.1.len(), 4);
    assert!(!since.2);
}

#[tokio::test]
async fn canvas_room_rejects_invalid_color() {
    let (env, code_id) = create_env();
    let program = env
        .deploy::<room_canvas_client::RoomCanvasClientProgram>(code_id, b"salt-rate-limit".to_vec())
        .create(128, 8, 16, 0)
        .await
        .unwrap();

    let user_env = env.clone().with_actor_id(USER_ID.into());
    let mut room = program.with_env(&user_env).room();
    let _: sails_rs::Result<u64, RoomError> = room.join(String::new(), 0).await.unwrap();

    let invalid: sails_rs::Result<u64, RoomError> = room.place_pixel(0, 0, 16).await.unwrap();
    assert!(matches!(invalid, Err(RoomError::InvalidColor)));
}

fn create_env() -> (GtestEnv, CodeId) {
    let system = System::new();
    system.init_logger_with_default_filter("gwasm=debug,gtest=info,sails_rs=debug");
    system.mint_to(OWNER_ID, 1_000_000_000_000_000);
    system.mint_to(USER_ID, 1_000_000_000_000_000);
    let code_id = system.submit_code(::room_canvas::WASM_BINARY);
    let env = GtestEnv::new(system, OWNER_ID.into());
    (env, code_id)
}

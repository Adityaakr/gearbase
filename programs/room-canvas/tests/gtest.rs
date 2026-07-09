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

#[tokio::test]
async fn canvas_room_rejects_double_join() {
    let (env, code_id) = create_env();
    let program = env
        .deploy::<room_canvas_client::RoomCanvasClientProgram>(
            code_id,
            b"canvas-double-join".to_vec(),
        )
        .create(8, 8, 16, 0)
        .await
        .unwrap();

    let user_env = env.clone().with_actor_id(USER_ID.into());
    let mut room = program.with_env(&user_env).room();
    let first: sails_rs::Result<u64, RoomError> = room.join("alice".into(), 1).await.unwrap();
    assert_eq!(first, Ok(1));

    let second: sails_rs::Result<u64, RoomError> = room.join("alice".into(), 1).await.unwrap();
    assert!(matches!(second, Err(RoomError::AlreadyJoined)));
}

#[tokio::test]
async fn canvas_room_rejects_leave_without_join() {
    let (env, code_id) = create_env();
    let program = env
        .deploy::<room_canvas_client::RoomCanvasClientProgram>(
            code_id,
            b"canvas-leave-unjoined".to_vec(),
        )
        .create(8, 8, 16, 0)
        .await
        .unwrap();

    let user_env = env.clone().with_actor_id(USER_ID.into());
    let mut room = program.with_env(&user_env).room();
    let res: sails_rs::Result<u64, RoomError> = room.leave().await.unwrap();
    assert!(matches!(res, Err(RoomError::NotJoined)));
}

#[tokio::test]
async fn canvas_room_rejects_configure_by_non_owner() {
    let (env, code_id) = create_env();
    let program = env
        .deploy::<room_canvas_client::RoomCanvasClientProgram>(
            code_id,
            b"canvas-configure-not-owner".to_vec(),
        )
        .create(8, 8, 16, 0)
        .await
        .unwrap();

    let config = room_canvas_app::CanvasConfig {
        width: 8,
        height: 8,
        palette_size: 16,
        cooldown_secs: 0,
    };
    let user_env = env.clone().with_actor_id(USER_ID.into());
    let mut room = program.with_env(&user_env).room();
    let res: sails_rs::Result<u64, RoomError> = room.configure(config.encode()).await.unwrap();
    assert!(matches!(res, Err(RoomError::NotOwner)));
}

#[tokio::test]
async fn canvas_room_rejects_close_by_non_owner() {
    let (env, code_id) = create_env();
    let program = env
        .deploy::<room_canvas_client::RoomCanvasClientProgram>(
            code_id,
            b"canvas-close-not-owner".to_vec(),
        )
        .create(8, 8, 16, 0)
        .await
        .unwrap();

    let user_env = env.clone().with_actor_id(USER_ID.into());
    let mut room = program.with_env(&user_env).room();
    let res: sails_rs::Result<u64, RoomError> = room.close_room().await.unwrap();
    assert!(matches!(res, Err(RoomError::NotOwner)));
}

#[tokio::test]
async fn canvas_room_rejects_place_without_join() {
    let (env, code_id) = create_env();
    let program = env
        .deploy::<room_canvas_client::RoomCanvasClientProgram>(
            code_id,
            b"canvas-place-unjoined".to_vec(),
        )
        .create(8, 8, 16, 0)
        .await
        .unwrap();

    let user_env = env.clone().with_actor_id(USER_ID.into());
    let mut room = program.with_env(&user_env).room();
    let res: sails_rs::Result<u64, RoomError> = room.place_pixel(0, 0, 0).await.unwrap();
    assert!(matches!(res, Err(RoomError::NotJoined)));
}

#[tokio::test]
async fn canvas_room_rejects_out_of_bounds_pixel() {
    let (env, code_id) = create_env();
    let program = env
        .deploy::<room_canvas_client::RoomCanvasClientProgram>(
            code_id,
            b"canvas-out-of-bounds".to_vec(),
        )
        .create(8, 8, 16, 0)
        .await
        .unwrap();

    let user_env = env.clone().with_actor_id(USER_ID.into());
    let mut room = program.with_env(&user_env).room();
    let _: sails_rs::Result<u64, RoomError> = room.join(String::new(), 0).await.unwrap();

    // x == width is one past the last valid column.
    let res: sails_rs::Result<u64, RoomError> = room.place_pixel(8, 0, 0).await.unwrap();
    assert!(matches!(res, Err(RoomError::InvalidBounds)));
}

#[tokio::test]
async fn canvas_room_rejects_place_during_cooldown() {
    let (env, code_id) = create_env();
    // Large cooldown so a second placement in the next block is still blocked.
    let program = env
        .deploy::<room_canvas_client::RoomCanvasClientProgram>(
            code_id,
            b"canvas-cooldown".to_vec(),
        )
        .create(8, 8, 16, 65535)
        .await
        .unwrap();

    let user_env = env.clone().with_actor_id(USER_ID.into());
    let mut room = program.with_env(&user_env).room();
    let _: sails_rs::Result<u64, RoomError> = room.join(String::new(), 0).await.unwrap();

    let first: sails_rs::Result<u64, RoomError> = room.place_pixel(0, 0, 0).await.unwrap();
    assert!(first.is_ok());

    let second: sails_rs::Result<u64, RoomError> = room.place_pixel(1, 0, 0).await.unwrap();
    assert!(matches!(second, Err(RoomError::CooldownActive { .. })));
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

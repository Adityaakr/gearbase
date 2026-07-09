use ::vault_client::{VaultClient as _, VaultClientCtors as _, admin::*, vault::*};
use sails_rs::{client::*, gtest::*, prelude::*};

const ACTOR_ID: u64 = 42;
const DEPOSIT_VALUE: u128 = 1_000_000_000_000;
const WITHDRAW_VALUE: u128 = 400_000_000_000;

#[tokio::test]
async fn vault_tracks_user_balance_and_withdraws_value() {
    let (env, program_code_id) = create_env();

    let program = env
        .deploy::<::vault_client::VaultClientProgram>(program_code_id, b"salt".to_vec())
        .create()
        .await
        .unwrap();

    let mut vault_service = program.vault();
    let admin_service = program.admin();
    let actor_id: ActorId = ACTOR_ID.into();

    let owner: sails_rs::Result<ActorId, sails_rs::String> = admin_service.owner().await.unwrap();
    let paused: sails_rs::Result<bool, sails_rs::String> = admin_service.is_paused().await.unwrap();
    let initial_balance: sails_rs::Result<u128, sails_rs::String> =
        vault_service.balance_of(actor_id).await.unwrap();
    let initial_total: sails_rs::Result<u128, sails_rs::String> =
        vault_service.total_balance().await.unwrap();

    assert_eq!(owner, Ok(actor_id));
    assert_eq!(paused, Ok(false));
    assert_eq!(initial_balance, Ok(0));
    assert_eq!(initial_total, Ok(0));

    let new_balance: sails_rs::Result<u128, sails_rs::String> = vault_service
        .deposit()
        .with_value(DEPOSIT_VALUE)
        .await
        .unwrap();

    assert_eq!(new_balance, Ok(DEPOSIT_VALUE));

    let balance_after_deposit: sails_rs::Result<u128, sails_rs::String> =
        vault_service.balance_of(actor_id).await.unwrap();
    let total_after_deposit: sails_rs::Result<u128, sails_rs::String> =
        vault_service.total_balance().await.unwrap();

    assert_eq!(balance_after_deposit, Ok(DEPOSIT_VALUE));
    assert_eq!(total_after_deposit, Ok(DEPOSIT_VALUE));

    let withdraw_result: sails_rs::Result<(), sails_rs::String> =
        vault_service.withdraw(WITHDRAW_VALUE).await.unwrap();
    assert_eq!(withdraw_result, Ok(()));

    let balance_after_withdraw: sails_rs::Result<u128, sails_rs::String> =
        vault_service.balance_of(actor_id).await.unwrap();
    let total_after_withdraw: sails_rs::Result<u128, sails_rs::String> =
        vault_service.total_balance().await.unwrap();

    assert_eq!(balance_after_withdraw, Ok(DEPOSIT_VALUE - WITHDRAW_VALUE));
    assert_eq!(total_after_withdraw, Ok(DEPOSIT_VALUE - WITHDRAW_VALUE));
}

#[tokio::test]
async fn admin_service_can_pause_and_unpause_vault() {
    let (env, program_code_id) = create_env();

    let program = env
        .deploy::<::vault_client::VaultClientProgram>(program_code_id, b"salt-admin".to_vec())
        .create()
        .await
        .unwrap();

    let mut vault_service = program.vault();
    let mut admin_service = program.admin();

    let pause_result: sails_rs::Result<(), sails_rs::String> = admin_service.pause().await.unwrap();
    let paused_after_pause: sails_rs::Result<bool, sails_rs::String> =
        admin_service.is_paused().await.unwrap();
    let deposit_while_paused: sails_rs::Result<u128, sails_rs::String> = vault_service
        .deposit()
        .with_value(DEPOSIT_VALUE)
        .await
        .unwrap();

    assert_eq!(pause_result, Ok(()));
    assert_eq!(paused_after_pause, Ok(true));
    assert_eq!(deposit_while_paused, Err("vault is paused".into()));

    let unpause_result: sails_rs::Result<(), sails_rs::String> =
        admin_service.unpause().await.unwrap();
    let paused_after_unpause: sails_rs::Result<bool, sails_rs::String> =
        admin_service.is_paused().await.unwrap();
    let deposit_after_unpause: sails_rs::Result<u128, sails_rs::String> = vault_service
        .deposit()
        .with_value(DEPOSIT_VALUE)
        .await
        .unwrap();

    assert_eq!(unpause_result, Ok(()));
    assert_eq!(paused_after_unpause, Ok(false));
    assert_eq!(deposit_after_unpause, Ok(DEPOSIT_VALUE));
}

fn create_env() -> (GtestEnv, CodeId) {
    let system = System::new();
    system.init_logger_with_default_filter("gwasm=debug,gtest=info,sails_rs=debug");
    system.mint_to(ACTOR_ID, 1_000_000_000_000_000);
    let code_id = system.submit_code(::vault::WASM_BINARY);
    let env = GtestEnv::new(system, ACTOR_ID.into());
    (env, code_id)
}

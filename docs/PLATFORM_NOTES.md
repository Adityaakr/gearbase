# Platform Notes

Phase 0 findings. Each item states whether it is documented, empirically verified, or both.

## Environment and toolchain

- Rust present: `rustc 1.95.0`, `cargo 1.95.0`.
- Node present: `v24.14.1`.
- pnpm present: `11.9.0`.
- Installed wasm targets include `wasm32v1-none`.
- `sails-cli` was outdated at start (`0.10.4`) and was upgraded to `2.0.0` to match current CLI behavior.
- `ethexe` was not installed initially. Official binaries were fetched from `https://get.gear.rs/` / `https://get.gear.rs/builds.json`.

Local verification:

- `vendor/vara-eth-skills/examples/vault`: `cargo build --release` passed, `cargo test --release` passed, `npm run check` passed.
- `vendor/vara-eth-skills/examples/escrow`: `cargo build --release` passed, `cargo sails sol target/wasm32-gear/release/order_escrow.idl` passed after upgrading `sails-cli`.
- `vendor/vara-eth-skills/examples/digit-recognition-injected-frontend`: `npm run check` passed, `npm run build` passed.

Observed version drift:

- The example README still uses `cargo sails sol --idl-path ...`, but `sails-cli 2.0.0` expects `cargo sails sol <IDL_PATH>`.
- `ethexe 2.0.0` local-dev mode is available, but a `1.10.x` example artifact uploaded into that runtime failed with `error code -32602: Failed to decode transaction`.
- `cargo sails new --eth` with `sails-rs 2.0.0` currently fails from crates.io because `gear-wasm-builder = "=2.0.0"` was not available during verification.

## Q1. Push updates

Conclusion:

- There is a documented watch path for an injected transaction's own promise via `injected_sendTransactionAndWatch`.
- There is no documented high-level third-party observer subscription for "program events" suitable for all room clients.
- `poll Seq() -> Since()` remains the safest v0 room sync design.

Sources:

- RPC API: `https://wiki.vara.network/docs/vara-eth/reference/rpc-api`
- Relevant low-level methods listed there:
  - `injected_sendTransactionAndWatch`
  - `block_events`
  - `block_outcome`

Evidence type:

- Documented only.

## Q2. Injected tx sender requirements

Conclusion:

- Official docs position injected transactions as Ethereum-key-signed but off-chain-submitted, with no ETH gas cost on the write path.
- That supports the intended burner-address model.
- Empirical verification against a fresh zero-balance address is still pending because no funded testnet room was available in this workspace.

Sources:

- RPC API: `https://wiki.vara.network/docs/vara-eth/reference/rpc-api`
- What is Vara.eth?: `https://wiki.vara.network/docs/vara-eth/start-here/what-is-vara-eth`
- Faucet explanation: `https://eth.vara.network/faucet`

Evidence type:

- Documented only.

## Q3. Browser signing UX

Conclusion:

- The documented/browser example path uses an injected EIP-1193 wallet as the signer for each injected transaction.
- The vendored digit-recognition example explicitly models a `signing` phase before `sendAndWaitForPromise()`.
- No sanctioned session-key or delegation pattern was found in the official vendored skills reviewed in Phase 0.
- For v0, assume interactive wallet signing per injected write in wallet mode.

Sources:

- Injected app skill: `vendor/vara-eth-skills/skills/vara-eth-injected-app-builder/SKILL.md`
- Injected workflow: `vendor/vara-eth-skills/playbooks/vara-eth-injected-app-workflow.md`
- Example code:
  - `vendor/vara-eth-skills/examples/digit-recognition-injected-frontend/src/varaEth.ts`
  - `vendor/vara-eth-skills/examples/digit-recognition-injected-frontend/src/App.tsx`

Evidence type:

- Both documented and code-verified.

## Q4. Per-message compute and payload limits

Conclusion:

- The docs currently state:
  - each message gets a small free compute threshold,
  - beyond that threshold, CPU time is metered at `wvaraPerSecond`,
  - consumption is deducted from executable balance.
- The exact per-op cost for a Gearbase canvas write was not measured in Phase 0 because a funded compatible deploy target was not available.
- There is a source-of-truth conflict on wVARA decimals:
  - official current docs say `18` decimals,
  - vendored skills/playbooks repeatedly state `12` decimals.
- Until empirically resolved, treat decimals as an open risk and do not publish sponsor UX estimates.

Sources:

- Funding Executable Balance: `https://wiki.vara.network/docs/vara-eth/interact/funding-executable-balance`
- wVARA Overview: `https://wiki.vara.network/docs/vara-eth/economics/wvara-overview`
- Vendored conflicting references:
  - `vendor/vara-eth-skills/skills/vara-eth-app-builder/SKILL.md`
  - `vendor/vara-eth-skills/playbooks/vara-eth-ethexe-cli-workflow.md`

Evidence type:

- Documented only, with unresolved source conflict.

## Q5. Timestamps

Conclusion:

- Programs can read `exec::block_timestamp() -> u64`.
- The installed Gear core docs define it as milliseconds since Unix epoch.
- This is suitable for fth-style timeout logic, but timeout rules should still allow slack for block cadence and visibility.

Sources:

- Installed implementation docs:
  - `/Users/adityakrx/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/gcore-1.10.0/src/exec.rs`
  - `/Users/adityakrx/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/sails-rs-1.0.0-beta.3/src/gstd/syscalls.rs`

Evidence type:

- Implementation-backed code inspection.

## Q6. Event delivery

Conclusion:

- Sails events exist at the program/runtime layer, but the reliable documented client path for app state is still query/read APIs.
- For observers, the robust path remains room-managed ring-buffer events served through queries like `Since`.
- Low-level block inspection methods exist, but they are not a documented generic room-event subscription API for third-party clients.

Sources:

- RPC API: `https://wiki.vara.network/docs/vara-eth/reference/rpc-api`
- Vendored workflow bias toward query/read confirmation:
  - `vendor/vara-eth-skills/playbooks/vara-eth-injected-app-workflow.md`
  - `vendor/vara-eth-skills/skills/vara-eth-full-app-builder/SKILL.md`

Evidence type:

- Documented only.

## Q7. Code upload flow

Conclusion:

- The documented CLI lifecycle is:
  1. import sender key with `ethexe key keyring import`
  2. `ethexe tx --ethereum-rpc ... --ethereum-router ... --sender ... upload <wasm> --watch`
  3. wait for validation and capture `code_id`
  4. `create <code_id>`
  5. `executable-balance-top-up <program_id> ... --approve`
  6. `send-message <program_id> <init_payload> 0`
  7. `query --rpc-url <vara_eth_ws> <program_id>`
- Exact CLI flags were verified against the installed `ethexe` help output.

Sources:

- Vendored CLI playbook: `vendor/vara-eth-skills/playbooks/vara-eth-ethexe-cli-workflow.md`
- Vendored injected workflow: `vendor/vara-eth-skills/playbooks/vara-eth-injected-app-workflow.md`
- Installed CLI help:
  - `/tmp/ethexe-v2.0.0-aarch64-apple-darwin/ethexe tx --help`
  - `/tmp/ethexe-v2.0.0-aarch64-apple-darwin/ethexe tx upload --help`
  - `/tmp/ethexe-v2.0.0-aarch64-apple-darwin/ethexe tx send-message --help`
  - `/tmp/ethexe-v2.0.0-aarch64-apple-darwin/ethexe tx query --help`

Evidence type:

- Both documented and CLI-verified.

## Q8. Public vara.eth node endpoints

Conclusion:

- Hoodi testnet:
  - Chain ID: `560048`
  - Ethereum RPC HTTPS: `https://hoodi-reth-rpc.gear-tech.io`
  - Ethereum RPC WS: `wss://hoodi-reth-rpc.gear-tech.io/ws`
  - Vara.eth validator WS:
    - `wss://vara-eth-validator-1.gear-tech.io`
    - `wss://vara-eth-validator-2.gear-tech.io`
    - `wss://vara-eth-validator-3.gear-tech.io`
    - `wss://vara-eth-validator-4.gear-tech.io`
- Hoodi contract addresses:
  - Router: `0xE549b0AfEdA978271FF7E712232B9F7f39A0b060`
  - wVARA: `0xE1ab85A8B4d5d5B6af0bbD0203EB322DF33d0464`

Sources:

- Network Endpoints: `https://wiki.vara.network/docs/vara-eth/reference/network-endpoints`
- Contract Addresses: `https://wiki.vara.network/docs/vara-eth/reference/contract-addresses`

Evidence type:

- Documented only.

## Remaining blockers

- No funded Hoodi deployer key or sponsor key is available in this workspace.
- No `.env` file or relevant environment variables were present.
- A public-faucet/manual-wallet step is still required before true Hoodi deploy verification.

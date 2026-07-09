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

Hoodi empirical deploy notes:

- Upload of `vault.opt.wasm` to Hoodi succeeded and code validation was approved.
- The upload transaction was:
  - upload tx: `0x2d5380664c139e1ea96b4409192d1e335132165f4acd91af57a76e0b54b3fafb`
  - validation approval tx: `0xee95b6ca7963e469c75f967bce498167c2c0b08e0a86fed7e9a8a13b97394b73`
- Program creation succeeded:
  - create tx: `0xe32a1229baeb8be668f87a984889eac98d4ffc11ec2f9f7568a13b669749dc02`
  - actor id: `0x08bcfbda4aa4fe9f6615194e1f179b8641319557`
- Important empirical finding: the upload transaction transferred the funded `wVARA` from the deployer to the Router before any executable-balance top-up happened.

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
- Hoodi empirical note:
  - funding `1000000000000000` raw units of `wVARA` was not enough for a full deploy flow,
  - that amount was consumed during upload/validation before executable-balance top-up could happen.
- The exact per-op cost for a Gearbase canvas write was not measured in Phase 0 because a funded compatible deploy target was not available.
- wVARA decimals: **resolved, the token reports `12`.** Measured 2026-07-10 by calling `decimals()`
  on `0xE1ab85A8B4d5d5B6af0bbD0203EB322DF33d0464`, which returns `0x0c`. `Router.wrappedVara()`
  confirms that address is the protocol's token. The wiki's `18` figure is prose and is wrong.
- The earlier claim in this file that "current Hoodi behavior is consistent with the official
  `18`-decimal docs" was an inference from an amount, not a measurement, and it was **incorrect**.
  Reading the funding tx `0x7bfc70ce...` at 12 decimals: `1e15` raw = **1000 wVARA**, not
  `0.001 wVARA`. The upload tx `0x2d5380...` then transferred that full 1000 wVARA to the Router.
- Open: why does `upload` cost 1000 wVARA? Unexplained by any doc. `scripts/deploy.ts` snapshots the
  deployer's wVARA balance before and after `upload` and prints the delta, so the next broadcast run
  measures it directly.
- Do not publish sponsor UX estimates yet; per-op cost remains unmeasured.

## Ethereum RPC has no subscriptions on Hoodi

- `ethexe tx upload --watch` **cannot work** against Hoodi's public Ethereum RPC.
- Measured 2026-07-10:
  - `https://hoodi-reth-rpc.gear-tech.io` rejects `eth_subscribe` with `-32603 Internal error`.
  - `wss://hoodi-reth-rpc.gear-tech.io/ws` answers `HTTP/2 403`.
- Therefore the validation gate must poll `Router.codeState(bytes32)` (selector `0xc13911e8`),
  where `2` means Validated. Selector verified against the live Router: it returns `0` for an
  unknown code id, while a bogus selector reverts.
- This matches `vendor/vara-eth-skills/references/error-log.md:237-273`.
- `scripts/deploy.ts` implements the polling path and never passes `--watch`.

Evidence type: measured against Hoodi on 2026-07-10.

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

- A Hoodi deployer wallet now has `1.0 ETH`, but `wVARA` was exhausted by upload before executable-balance top-up.
- No sponsor wallet is prepared yet.
- A full Hoodi deploy verification is still blocked on executable-balance funding and end-to-end create/top-up/init checks.

## Code upload costs a flat 1000 wVARA

- Measured on Hoodi, 2026-07-10.
- `ethexe tx upload` charges **exactly `1000 wVARA` (`1e15` raw units) per code**, independent of
  wasm size. A 97.16 KiB code was charged the same 1000 wVARA.
- Proof: uploading with a `995 wVARA` balance reverted with the typed ERC-20 error
  `ERC20InsufficientBalance(0xb941...5EC4, 995000000000000, 1000000000000000)`
  (selector `0xe450d38c`). The revert happened during gas estimation, so no tx was mined and no gas
  was spent.
- This retires the earlier theory that `upload` "sweeps the whole balance". The first upload only
  looked like a sweep because the balance was coincidentally exactly 1000 wVARA.
- Budget accordingly: 3 rooms = `3000 wVARA` of upload fees, plus roughly `1 wVARA` per room for the
  executable-balance top-up that `Gearbase.create()` performs.
- `scripts/deploy.ts` checks this in preflight and refuses to start when the balance is short,
  rather than reverting mid-flight.

### First gearbase code on Vara.eth

- `room_poll` uploaded and validated on Hoodi, 2026-07-10.
- `code_id`: `0x91d025ee95bff91e3a97880e4c47deb5f4c1b60c68f5ef4ccd957d54f2913508` (blake2b256)
- `Router.codeState(code_id)` returns `2` (Validated), verified independently of the deploy script.
- No room has been *created* from it yet: that needs an executable-balance top-up, and the upload
  consumed the entire wVARA balance.

Evidence type: measured on chain.

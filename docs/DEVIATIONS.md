# Deviations

Record any place where the implementation diverges from `gearbase-spec.md`.

Use this format:

## <short title>

- spec section:
- implemented behavior:
- reason:
- source:

## Current CLI syntax drift

- spec section: 2, 9
- implemented behavior: current `sails-cli 2.0.0` uses `cargo sails sol <IDL_PATH>` instead of `cargo sails sol --idl-path <IDL_PATH>`.
- reason: verified current CLI behavior differs from the vendored example README text.
- source:
  - `vendor/vara-eth-skills/examples/escrow/README.md`
  - `cargo sails sol --help`

## wVARA decimals conflict (RESOLVED: 12 decimals)

- spec section: 1, 5.5, 6.5, 13
- status: resolved on 2026-07-10 by querying the token contract directly.
- conclusion: **wVARA has 12 decimals.** `1 wVARA = 1_000_000_000_000` base units.
- evidence:
  - `decimals()` on `0xE1ab85A8B4d5d5B6af0bbD0203EB322DF33d0464` returns `0x0c` (12).
  - `Router.wrappedVara()` on `0xE549b0AfEdA978271FF7E712232B9F7f39A0b060` returns that same
    token address, so it is the token the protocol actually uses.
  - the vendored playbook agrees: `vendor/vara-eth-skills/playbooks/vara-eth-ethexe-cli-workflow.md:31`
- the `18`-decimal reading came from wiki prose, not from the contract. The contract wins.
- consequence: the earlier note that the deployer was funded `0.001 wVARA` was wrong. The funding
  tx `0x7bfc70ce...` moved `1e15` raw units, which is **1000 wVARA**, and the upload tx
  `0x2d5380...` transferred that entire balance to the Router. Why upload consumed 1000 wVARA is
  still unexplained. `scripts/deploy.ts` now measures the wVARA delta across `upload` so the next
  run answers it.
- guardrail: `scripts/deploy.ts` and `scripts/smoke.ts` both assert `decimals() == 12` and refuse
  to proceed otherwise, so a protocol change cannot silently corrupt amounts.
- source:
  - `vendor/vara-eth-skills/playbooks/vara-eth-ethexe-cli-workflow.md:31`
  - `https://wiki.vara.network/docs/vara-eth/economics/wvara-overview` (contradicted by the chain)

## Local dev compatibility split

- spec section: 9 phase 0
- implemented behavior: local-node verification currently requires a compatibility-aware split:
  - `ethexe 2.0.0` provides workable `run --dev`,
  - `1.10.x` example artifacts do not upload cleanly into that runtime,
  - fresh `sails-rs 2.0.0` scaffolding currently failed due missing `gear-wasm-builder = "=2.0.0"` from crates.io during verification.
- reason: platform/example/tooling versions are not aligned cleanly in the current environment.
- source:
  - `/tmp/ethexe-v2.0.0-aarch64-apple-darwin/ethexe run --help`
  - local upload failure against `vault.opt.wasm`
  - `cargo sails new ... --eth` failure logs

## Phase overlap while Hoodi funding is blocked

- spec section: 9
- implemented behavior: local Phase 1 implementation work started before full Phase 0 acceptance completed.
- reason: Hoodi upload/create verification succeeded, but executable-balance top-up and the remaining live testnet checks are blocked on fresh `wVARA`; local Rust/TS implementation could progress safely in parallel.
- source:
  - `docs/PROGRESS.md`
  - `docs/hoodi-funding.md`

## ABI-safe room surface uses tuple views

- spec section: 5.3, 5.4
- implemented behavior: the exported Sails surface for `room-canvas` currently uses primitive/tuple views for several methods:
  - `Join(name: String, kind: u16)` instead of `Join(profile: Option<Profile>)`
  - `PlacePixel(x, y, color)` instead of a struct argument
  - `Info`, `Since`, and `Participants` return tuple-based views instead of custom structs
- reason: current `sails-rs` `ethexe` macro expansion requires Solidity-compatible public input/output shapes; custom structs and `Option<String>` inputs failed compilation.
- source:
  - local compile errors from `cargo test --release -p room-canvas`
  - `programs/room-canvas/app/src/lib.rs`

## SDK create path depends on validated code ids

- spec section: 6.1, 6.4
- implemented behavior: `@gearbase/sdk` now ships room runtimes for `canvas`, `poll`, and `fth`, including `create(...)`, room `fuel()`, room `sponsor(...)`, and `lowFuel` events.
- deviation: `create(...)` requires a validated `codeId` per template to be provided through `Gearbase.connect({ templateCodeIds })` or the per-call `create(..., { codeId })` override.
- reason: code upload and validation are still explicitly CLI-first in the official Vara.eth playbooks, so the SDK should not guess or fake a code-discovery path.
- source:
  - `packages/sdk/src/index.ts`
  - `packages/clients/src/generated.ts`

## FTH phase model is simplified onchain

- spec section: 5.4, 8.2
- implemented behavior: `room-fth` uses a compact phase model `Lobby -> Answering -> Voting -> Ended|Aborted`; advancing from round N to N+1 is another `StartRound(prompt)` call instead of a separate onchain `Prompting` sub-phase.
- reason: the gameplay semantics still hold, while the public ABI stays smaller and the transition surface is easier to verify in gtests.
- source:
  - `programs/room-fth/app/src/lib.rs`
  - `programs/room-fth/tests/gtest.rs`

## Showcase is a tester, not a directory app

- spec section: 3, 7, 9 phase 6
- implemented behavior: `apps/showcase` is currently a light-themed onchain playground for attaching to live `canvas` and `poll` rooms and sending test writes, rather than a final room-directory showcase.
- reason: this remains the shortest route to a useful manual test surface while public room seeding and final launch content are still unfinished.
- source:
  - `apps/showcase/src/App.tsx`

## Agent runner is fth-first

- spec section: 8.4
- implemented behavior: `@gearbase/agent-runner` currently provides a working fth-specific runtime loop and YAML loader, but it does not yet expose a pluggable strategy module system for other room types.
- reason: the flagship demo needs real agent participation first; the reusable strategy abstraction can be layered on once the basic runner is proven on testnet.
- source:
  - `packages/agent-runner/src/index.ts`

## Canvas web still ships a heavy async SDK chunk

- spec section: 7
- implemented behavior: `apps/canvas-web` lazy-loads `@gearbase/sdk`, which keeps the initial UI chunk smaller, but the async SDK/runtime chunk is still about 2.1 MB minified because it pulls the current Vara.eth and Gear JS browser stack.
- reason: this is the documented dependency path for injected writes today; further reduction will require chunk splitting or a thinner browser-facing transport layer.
- source:
  - local `vite build` output in `apps/canvas-web`

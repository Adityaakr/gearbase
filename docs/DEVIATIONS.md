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

## wVARA decimals conflict

- spec section: 1, 5.5, 6.5, 13
- implemented behavior: no sponsor-UX math or top-up estimation was encoded yet because the source-of-truth currently conflicts on decimals.
- reason: vendored skills/playbooks say `12` decimals while current official docs say `18` decimals.
- source:
  - `vendor/vara-eth-skills/skills/vara-eth-app-builder/SKILL.md`
  - `vendor/vara-eth-skills/playbooks/vara-eth-ethexe-cli-workflow.md`
  - `https://wiki.vara.network/docs/vara-eth/economics/wvara-overview`
  - `https://wiki.vara.network/docs/vara-eth/interact/funding-executable-balance`

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

## SDK scope is canvas-first

- spec section: 6.1, 6.4
- implemented behavior: `@gearbase/sdk` currently ships a real connection layer and room runtime for the `canvas` template only; `create(...)`, sponsorship flows, low-fuel monitoring, and other template-specific room clients are not implemented yet.
- reason: the current repo has one live room IDL and one implemented program surface; building the documented injected-write/read path against that concrete room is the shortest route to a verifiable SDK baseline.
- source:
  - `packages/sdk/src/index.ts`
  - `packages/clients/src/generated.ts`

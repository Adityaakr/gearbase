# Progress

## Phase 0

Status: in progress, partially verified

- Repo scaffolding created.
- Vendored `vendor/vara-eth-skills`.
- Read the primary relevant skills and playbooks:
  - `vara-eth-injected-app-builder`
  - `vara-eth-app-builder`
  - `vara-eth-contract-writer`
  - `vara-eth-full-app-builder`
  - injected app / CLI / TS workflows
- Example verification results:
  - `examples/vault`: Rust build passed, Rust tests passed, TypeScript check passed
  - `examples/escrow`: Rust build passed, Solidity generation passed after `sails-cli` upgrade
  - `examples/digit-recognition-injected-frontend`: TypeScript check passed, production build passed
- Toolchain findings:
  - `sails-cli` had to be upgraded from `0.10.4` to `2.0.0`
  - `ethexe` had to be installed manually from official published binaries
- Platform findings for Q1-Q8 recorded in `docs/PLATFORM_NOTES.md`
- Hoodi live deploy progress:
  - code upload succeeded
  - code validation succeeded
  - program creation succeeded
  - executable-balance top-up blocked because the initial `wVARA` funding was consumed during upload
- Remaining blockers:
  - Hoodi deployer wallet has ETH, but no `wVARA` remains for executable-balance top-up
  - No sponsor wallet prepared yet
  - Fresh zero-balance injected-tx empirical check not yet run
  - Per-op executable-balance measurement not yet captured
  - Current local-dev path has version-compatibility drift between `ethexe` and the vendored example stack

## Parallel local implementation

Status: in progress while Hoodi executable-balance funding is blocked

- Added the monorepo workspace skeleton:
  - root Cargo workspace
  - pnpm workspace
  - package/app placeholders for `sdk`, `clients`, `agent-runner`, and the four web apps
- Implemented `programs/gearbase-core` with:
  - room metadata
  - membership
  - event ring buffer / `Since`
  - rate limiter
  - unit tests
- Implemented `programs/room-canvas` with:
  - base room surface
  - packed pixel storage
  - region reads
  - join / leave / configure / close
  - event emission and ring-buffer recording
  - gtest coverage for join/pixel/since flow and invalid-color rejection
- Implemented the first real TypeScript client layer:
  - `@gearbase/clients` now embeds generated room IDLs and loads `SailsProgram` instances
  - `@gearbase/sdk` now connects through the documented `@vara-eth/api` + `sails-js` flow
  - burner / wallet / private-key identity wiring added
  - canvas room polling, queries, and injected writes wired against the current room surface
- Local verification:
  - `cargo test --release -p gearbase-core -p room-canvas` passes
  - `CI=true pnpm -r typecheck` passed before the SDK dependency update
  - `CI=true pnpm -r build` passed before the SDK dependency update
  - `./node_modules/.bin/tsc -p packages/clients/tsconfig.json` passes
  - `./node_modules/.bin/tsc -p packages/sdk/tsconfig.json` passes
  - `../../node_modules/.bin/tsc -p apps/canvas-web/tsconfig.json --noEmit` passes
  - `../../node_modules/.bin/vite build` passes in `apps/canvas-web`
  - `cargo test --release -p room-poll` passes
  - `cargo test --release -p room-fth` passes
  - `./node_modules/.bin/tsx packages/clients/src/generate.ts` now emits 3 room IDLs (`canvas`, `poll`, `fth`)
  - `./node_modules/.bin/tsc -p packages/sdk/tsconfig.json --noEmit` passes after adding `poll` and `fth` room runtimes
  - `./node_modules/.bin/tsc -p packages/agent-runner/tsconfig.json --noEmit` passes
  - `../../node_modules/.bin/tsc -p apps/poll-web/tsconfig.json --noEmit` passes
  - `../../node_modules/.bin/tsc -p apps/fth-web/tsconfig.json --noEmit` passes
  - `../../node_modules/.bin/tsc -p apps/showcase/tsconfig.json --noEmit` passes
  - `../../node_modules/.bin/vite build` passes in `apps/poll-web`
  - `../../node_modules/.bin/vite build` passes in `apps/fth-web`
  - `../../node_modules/.bin/vite build` passes in `apps/showcase`

## Current product slice

Status: locally integrated, still blocked on final Hoodi fuel-backed end-to-end verification

- `programs/room-poll` is implemented with revoting, tally tracking, and gtests.
- `programs/room-fth` is implemented with:
  - fixed-seat lobby
  - host commit
  - multi-round prompting/answering
  - spectator voting
  - reveal + abort path
  - gtests for both happy path and abort path
- `@gearbase/sdk` now exposes:
  - `joinCanvas`
  - `joinPoll`
  - `joinFth`
  - `create(...)` for `canvas`, `poll`, and `fth` when a validated template `codeId` is supplied
  - room `fuel()` reads
  - room `sponsor(...)` top-ups
  - `lowFuel` event hooks
  - typed room runtimes for all three templates
- `apps/poll-web` now supports:
  - burner voting
  - wallet-based poll creation
  - explicit sponsorship top-ups
- `apps/fth-web` is a light-themed room UI with:
  - burner / wallet connect
  - wallet-based room creation
  - seat actions
  - voting
  - transcript view
  - host commit / reveal controls
- `apps/showcase` is now a light-themed onchain playground for quick canvas + poll testing.
- `@gearbase/agent-runner` now loads `agents.yaml`, joins an fth room with private-key identities, seats agents, and submits answers through an OpenAI-compatible chat endpoint.

## 2026-07-10 - test hardening, deploy tooling, and two corrections

Status: offline verification is now real. On-chain execution is still **zero**.

Measured, not asserted:

- `cargo test --workspace`: 35 passing (was 9). Added 26 rejection-path tests, so every room
  command now has one, satisfying the rule in `AGENTS.md`. Breakdown: canvas 9, fth 14, poll 9,
  gearbase-core 3.
- `pnpm test`: 43 passing (was 0). Previously `packages/sdk` ran bare `vitest run` and died on
  "No test files found", which aborted the recursive run before any app was reached. So the old
  green was a false signal.
- `pnpm typecheck`: 7/7 clean.
- `pnpm smoke`: rewritten from a one-line stub into 6 read-only chain assertions. 6/6 green
  against live Hoodi.
- `pnpm deploy`: new. Dry run by default, `--broadcast` to upload.

Two things the docs had wrong, both corrected:

1. **wVARA has 12 decimals, not 18.** Measured via `decimals()` on the token, cross-checked against
   `Router.wrappedVara()`. The 18-decimal claim was inferred from an amount, never measured. This
   means the deployer was funded 1000 wVARA, not 0.001, and `upload` consumed all of it. Why upload
   costs that much is still unexplained; `scripts/deploy.ts` now measures the delta.
2. **A latent crash in `decodeCanvasSnapshot`.** `Vec<u8>` survives polkadot's `.toJSON()` as a hex
   string, not an array, so `.map(...)` threw on every real snapshot. A type cast had silenced
   TypeScript. Fixed, with a regression test. This is good evidence the canvas read path had never
   run against a chain.

Also disproved a suspected bug: commands that mutate state and then return `Err` do **not** leak a
seq bump, because `#[export(unwrap_result)]` panics and gear rolls back all state on a userspace
panic. Verified empirically. Do not "fix" that pattern.

Still blocked, unchanged: deploy needs >= 1 wVARA for `executable-balance-top-up`. The deployer
holds 0. wVARA cannot be minted or wrapped from ETH by this stack, and no faucet is documented. It
must be sent by a human. Once funded, `pnpm deploy --broadcast` uploads all three rooms and prints
the `VITE_*_CODE_ID` values the apps need.

# gearbase - project model

*Last updated: 2026-07-10 by `/prism-understand`. Update IN PLACE. Never wipe prior content.*

Durable, evidence-cited model of this repo. Every line about the code carries a `file:line`.

---

## Architecture

gearbase is a monorepo of onchain "room" templates for Vara.eth (a Gear runtime settled on
Ethereum), targeting the Hoodi testnet.

Four layers, bottom up:

1. **`programs/gearbase-core`** - shared `#![no_std]` library, not a deployable program (no
   `build.rs`, no `#[program]`). Supplies `RoomCore` (`programs/gearbase-core/src/lib.rs:271`),
   the shared `RoomError` enum (`:95-127`), `MembershipState` (`:130`), a bounded ring-buffer
   `EventSequencer` (`:154-213`), and a `TokenBucket`/`RateLimiter` (`:216-268`).
2. **Three room programs**, each a 3-crate set (`<room>` artifact + `app` logic + `client`):
   - `room-canvas` - r/place pixel canvas, 4-bit packed pixels (`programs/room-canvas/app/src/lib.rs:82`)
   - `room-poll` - multi-option poll with revote (`programs/room-poll/app/src/lib.rs:84`)
   - `room-fth` - "Find the Human" commit-reveal social deduction, keccak256 commit
     (`programs/room-fth/app/src/lib.rs:178`), 5 fixed seats (`:10`)
   Each embeds a `RoomCore` and re-exports the same 6 wrappers `join/leave/configure/close_room/
   info/seq/since/participants` (canvas `app/src/lib.rs:3-5`, poll `:3-5`, fth `:3-5`).
3. **TS packages**
   - `packages/sdk` - the whole transport. `Gearbase.connect()` (`packages/sdk/src/index.ts:2203`)
     is the only constructor path. Reads are dry-run `calculateReplyForHandle` (`:1040`); writes are
     `createInjectedTransaction` + `sendAndWaitForPromise` (`:1477-1482`).
   - `packages/clients` - IDL strings embedded by a generator (`packages/clients/src/generate.ts`),
     output committed at `packages/clients/src/generated.ts`. Runtime clients built by
     `loadRoomProgram` (`packages/clients/src/index.ts:48-62`).
   - `packages/agent-runner` - fth-only LLM bot driver, talks through the SDK, not the chain
     (`packages/agent-runner/src/index.ts:174`).
4. **Four Vite + React 19 SPAs** - `canvas-web`, `poll-web`, `fth-web` (most complete: dual
   identity, room creation, commit/reveal, sponsorship), `showcase` (self-described "onchain test
   surface", `apps/showcase/src/App.tsx:248`). All are thin shells over the SDK, no mock data.

**Sync model is polling, not push.** Each room runs a `setTimeout` loop calling `Seq()` then
`Since(fromSeq)` and diffing (`packages/sdk/src/index.ts:1291`,`:1315`), default `pollMs` 400 (`:2197`).

---

## Invariants

- **wVARA has 12 decimals, so 1 wVARA = 1_000_000_000_000 base units.** Verified live against the
  contract: `decimals()` on `0xE1ab85A8B4d5d5B6af0bbD0203EB322DF33d0464` returns `0x0c`. The router
  confirms this is its token: `Router.wrappedVara()` returns that address. This **resolves** the
  conflict recorded at `docs/DEVIATIONS.md:23-32`, which guessed 18. The 18-decimal reading at
  `docs/PLATFORM_NOTES.md:111-113` is an inference from behavior and is **wrong**.
- **`executable-balance-top-up` must happen before any message will execute**
  (`vendor/vara-eth-skills/playbooks/vara-eth-ethexe-cli-workflow.md:104-113`).
- **`upload` must return a validated `code_id` before `create` is legal**
  (`vendor/vara-eth-skills/playbooks/vara-eth-ethexe-cli-workflow.md:30`).
- **The initializer (first-message sender) must equal the account that created the program**
  (`vendor/vara-eth-skills/playbooks/vara-eth-ts-api-workflow.md:210`).
- **`send-message <payload> <value>`: the `value` is ETH, not wVARA**
  (`vendor/vara-eth-skills/playbooks/vara-eth-ethexe-cli-workflow.md:32`).
- **Reply codes**: `0x00000000` = success auto reply, `0x00010000` = success manual reply
  (`packages/sdk/src/index.ts:339`).
- **Owner is exempt from the rate limiter** (`programs/gearbase-core/src/lib.rs:355`).
- **Room state mutation happens before event emission**, so a failed emit panics after state has
  already advanced (see Danger zones).

---

## Conventions

- Rust: `edition = "2024"`, toolchain pinned `1.95.0`, target `wasm32v1-none`
  (`rust-toolchain.toml:1-4`). `sails-rs = "=1.0.1"` (`Cargo.toml:34`) - note the vendored skills
  use `1.0.0-beta.2` (`vendor/vara-eth-skills/skills/vara-eth-contract-writer/SKILL.md:44-53`).
- Commands are `#[export(unwrap_result)]`, queries are plain `#[export]`
  (`programs/room-canvas/app/src/lib.rs:160` vs `:270`).
- Room ABI surface deliberately uses tuple views instead of structs/Option for ABI safety
  (`docs/DEVIATIONS.md:56-66`).
- Chain config: hardcoded `HOODI_DEFAULTS` in the SDK (`packages/sdk/src/index.ts:333-337`),
  overridable per-call. The SDK never reads `process.env`; only `agent-runner` does, and only for
  `LLM_*` (`packages/agent-runner/src/index.ts:83-85`).
- `kind_from_code`/`kind_code` are duplicated verbatim in all three rooms rather than living in
  core (canvas `app/src/lib.rs:65-80`, poll `:67-82`, fth `:144-159`).

---

## Danger zones

- **Nothing gearbase is deployed.** The only actor id recorded
  (`0x08bcfbda4aa4fe9f6615194e1f179b8641319557`, `docs/PLATFORM_NOTES.md:34`) is the **vendored
  vault example's** WASM (`docs/PLATFORM_NOTES.md:28` says `vault.opt.wasm`), not a room. Phase 0
  proved the pipeline using someone else's program.
- **Deploy is hard-blocked on wVARA.** Deployer `0xb941D815859A92B7Fd095a47012931dC8F3b5EC4` holds
  **0 wVARA** and 0.9996 ETH (live `eth_call`/`eth_getBalance`). It was funded 1e15 raw = **1000
  wVARA** (tx `0x7bfc70ce...`), and the upload tx (`0x2d5380...`) transferred the **entire balance**
  to the Router. wVARA cannot be minted or wrapped by this stack: `@vara-eth/api`'s
  `WrappedVaraClient` exposes no `deposit`/`wrap`/`mint`. The funding source
  `0x5c4beabdeb092de85db2efc9bdb6fc0553803209` is an **EOA** holding ~5.45M wVARA, i.e. a
  human-operated tap, not a faucet contract. No faucet is documented in `vendor/`.
- **`emit_event(...).expect(...)` at ~40 sites** across all three rooms (e.g. canvas
  `app/src/lib.rs:182,184,202,204`; fth `:343,345`). State is mutated and seq advanced *before* the
  emit, so an emit failure panics on already-committed state. Most systemic hazard in the programs.
- **Constructors panic on invalid config** rather than returning `Err`: canvas
  `app/src/lib.rs:408`, poll `:384`, fth `:816`.
- ~~poll `configure` advances seq then returns `Err`, leaking a seq bump~~ **DISPROVED 2026-07-10.**
  `#[export(unwrap_result)]` panics on `Err`, and gear rolls back all state on a userspace panic.
  Probed empirically: after a rejected `place_pixel`, the reply was
  `Error(Execution(UserspacePanic))` and `seq` stayed at 1, not 2. The "mutate then `Err`" pattern
  appears in poll `vote`, canvas `place_pixel`, and fth `sit_down`/`cast_vote`/`submit_answer`, and
  is **safe** in all of them. Do not "fix" it.
  Separately, the `else if` at `programs/room-poll/app/src/lib.rs:221-222` is provably unreachable
  (`tally.len()` is always kept equal to `config.options.len()`). Dead code, not a bug.
- **A live plaintext private key sits in the working tree** at `.env.hoodi.local` (untracked and
  gitignored; verified never committed via `git log --all`). It controls the funded deployer wallet.
- **`Vec<u8>` survives polkadot's `.toJSON()` as a hex string, not an array.** This crashed
  `decodeCanvasSnapshot` on every real snapshot until it was fixed to use `bytesFromUnknown`
  (`packages/sdk/src/index.ts:369`). A `as [...]` cast had silenced TypeScript. Any new decoder that
  indexes a `.toJSON()`ed `Vec<u8>` will hit the same trap. Regression test:
  `packages/sdk/test/scale-codec.test.ts`.
- **No CI.** No `.github/` at the repo root. (Ironically a complete Gear CI workflow exists in the
  gitignored `scratch/hello-vara-eth/.github/workflows/ci.yml`.) `pnpm test` + `pnpm smoke` are now
  both meaningful and would make a good first workflow.
- **`gearbase-spec.md` is a stub.** It states the real spec lives in "the product-owner message in
  the setup conversation" (`gearbase-spec.md:21`). Yet `docs/DEVIATIONS.md` cites spec sections
  5.3, 5.4, 6.1, 8.2, 13. **Those citations are unverifiable in-repo.** The phase order that
  `AGENTS.md:11` makes normative does not exist in the repo.
- **Local node is not an escape hatch.** `ethexe 2.0.0` rejects vendored `1.10.x` artifacts
  (`Failed to decode transaction`), and `sails-rs 2.0.0` scaffolding fails to build
  (`docs/local-dev.md:9-15`, `docs/DEVIATIONS.md:34-45`).

---

## Verified build/test status (measured 2026-07-10, after the test/deploy pass)

- `pnpm typecheck` - **passes**, 7/7 projects.
- `cargo test --workspace` - **passes, 35 tests** (3 core unit, 9 canvas, 14 fth, 9 poll). Includes
  26 rejection-path tests added to satisfy `AGENTS.md:23`; every room command now has one.
- `pnpm test` - **passes, 43 tests** (sdk 26, canvas-web 12, clients 5). Previously this was a false
  signal: `packages/sdk` ran bare `vitest run` and aborted the recursive run on "no test files".
- `pnpm smoke` - **real**, 6/6 read-only checks green against live Hoodi.
- `pnpm deploy` - dry run by default, `--broadcast` to upload. Polls `codeState`, never `--watch`.
- `pnpm dev` - serves `apps/canvas-web` on Vite (`package.json:8`).

Meaning: the code is now genuinely tested offline. It still has **never executed on chain**. No
gearbase room is deployed; deploy is blocked on wVARA (see Danger zones). Treat "implemented" in
`docs/PROGRESS.md` as *compiles and unit-tests pass*, never as *works on chain*.

---

## Decision log

- (none yet - `/prism-plan` output will land in `docs/NN-*.md`)

---

## Lessons

*(reserved for `/prism-retro`; never delete)*

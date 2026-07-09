---
name: vara-eth-full-app-builder
description: Build and verify complete user-facing Vara.eth applications. Use when Codex is asked to create, organize, repair, or review a full app or dApp that spans Rust/Sails contracts, Vara.eth deploy or attach flows, TypeScript interaction modules, wallet-based frontend UX, ABI-enabled calls, Solidity adapters, environment configuration, scripts, and end-to-end validation.
---

# Vara.eth Full App Builder

Use this skill when the task is bigger than contract authoring or a single deploy/interact script. A full Vara.eth app should give users a working product surface plus the operational path needed to build, configure, run, and verify it.

## Core Rule

Treat the app as three connected systems:

- On-chain behavior: contract, IDL, generated ABI, and artifacts.
- Runtime workflow: upload, validation, create, top-up, init, messages, replies, and state reads.
- User surface: frontend, wallet, scripts, configuration, status states, and documentation.

Do not let any layer guess the others. Use generated IDL or ABI outputs, explicit env placeholders, and verified commands.

## Select Supporting Skills

Read only the narrow supporting skill needed for the current slice:

- Contract creation or changes: `../vara-eth-contract-writer/SKILL.md`.
- Deploy, top-up, init, TypeScript, CLI, replies, or ABI lifecycle: `../vara-eth-app-builder/SKILL.md`.
- Injected transaction frontend, wallet-signed Vara.eth writes, or injected setup/cost measurement: `../vara-eth-injected-app-builder/SKILL.md`.
- Solidity adapter frontend, wallet calls to adapter, callback polling, or adapter plus Vara.eth state reads: `../vara-eth-mirror-adapter-frontend-builder/SKILL.md`.
- Solidity adapter, escrow, bridge-like flow, or callback handler: `../vara-eth-solidity-integrator/SKILL.md`.

Read `../../playbooks/vara-eth-full-app-workflow.md` before designing or restructuring an app. Use `../../references/flow-checks.md` as the final deploy/interact checklist.

## Workflow

1. Define the product flow: users, actions, success state, failure state, and which network or local mode is expected.
2. Choose the integration architecture: direct Mirror/Sails payloads, ABI-enabled mirror, or Solidity adapter callbacks.
3. Establish the contract boundary. If artifacts already exist, do not rewrite the contract unless the user asked for behavior changes.
4. Build or repair the interaction layer before the UI. Keep API setup, IDL parsing, payload encoding, reply waiting, state reads, and ABI calls outside view components.
5. Build the frontend around real async states: wallet disconnected, wrong network, transaction pending, reply pending, state pending, confirmed, and failed.
6. Add scripts and configuration for repeatable setup: build, typecheck, create or attach, executable-balance top-up, init, smoke read, and app check.
7. Verify from the command line first, then through the UI when a dev server is available.

## Architecture Rules

- Direct Mirror apps should use `@vara-eth/api`, `getMirrorClient(...)`, `SailsProgram`, `SailsIdlParser` from `sails-js/parser`, hex payloads, reply listeners, and `calculateReplyForHandle(...)` for reads.
- ABI-enabled apps must deploy the generated Solidity ABI interface before `createProgramWithAbiInterface(...)`.
- Solidity adapter apps must store `messageId -> operation context` and complete local state only from trusted callbacks.
- Solidity adapter apps must test unit-return callbacks, not only value-return callbacks; if Vara.eth state is final but adapter state is pending, check Mirror `ReplyCallFailed` and callback selector mismatches such as `bytes32` versus `bytes32,()`.
- Frontend apps must use wallet signing. Do not ask users to paste private keys into browser UI.
- Keep private keys out of committed files, docs, examples, and screenshots.
- Keep ETH value, Vara.eth native value, owned balance, executable balance, and wVARA labels separate.
- Treat Ethereum transaction receipts and Vara.eth state visibility as separate milestones.

## App Quality Bar

A complete app should include:

- Clear package layout for contract, app/frontend, and scripts.
- `.env.example` with placeholders for RPC endpoints, Router, program id, code id, ABI interface address, salts, and optional feature flags.
- A typed interaction module or client wrapper that the UI imports.
- User-facing status and error states for the expected Vara.eth lifecycle.
- README or app docs with setup, commands, required artifacts, network assumptions, and validation notes.
- Tests or checks proportional to the risk: contract tests, TypeScript typecheck, Solidity build, and smoke state reads where relevant.

## Validation

Run the relevant checks before calling the app ready:

- Rust contract: `cargo build --release` and `cargo test --release`.
- TypeScript/frontend: package check command, usually `npm run check`, plus lint/test when present.
- ABI path: `cargo sails sol --idl-path ...` after IDL changes.
- Solidity adapter: `forge build` or the repo's Solidity compiler check when available.
- Network flow: verify observable state or reply output, not only submitted transactions.
- ABI adapter flow: verify both Vara.eth program state and Solidity adapter callback state; a successful Vara.eth reply is not enough if the Mirror callback call failed.

If a check needs live RPC, funded accounts, or user secrets, state that clearly and leave placeholders instead of inventing values.

## Output Discipline

When finishing an app task, report:

- Which architecture path was used.
- Which files or packages changed.
- Which checks passed.
- What still requires live network credentials, deployed addresses, or manual wallet interaction.

Keep examples implementation-backed and avoid importing `vault` or `escrow` business logic unless the requested app is actually a vault or escrow.

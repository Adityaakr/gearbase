# AGENTS.md

## Purpose

This repository contains tool-agnostic playbooks, references, examples, and agent skills for Vara.eth work.

## Rules

- Keep canonical task guidance in `playbooks/`.
- Keep reusable factual material in `references/`.
- Keep self-contained agent-facing task instructions in `skills/`.
- Do not make the repository depend on one agent runtime or one local installation path.
- Update shared playbooks first when behavior changes, then update skills that depend on them.
- Keep examples implementation-backed and avoid speculative claims.
- When source priority changes, keep all playbooks and skills aligned.
- Keep Rust and Sails contract-writing guidance consistent across the contract-writer and app-builder materials.
- Keep Solidity integration guidance generic. Concrete examples may illustrate a pattern, but a skill should not depend on one example's business logic.
- Do not add agent-specific metadata, local absolute paths, private keys, or machine-specific setup to reusable skills and playbooks.

## Skill Selection

Use the narrowest skill for the task:

- `skills/vara-eth-contract-writer/SKILL.md` for Rust/Sails Vara.eth contracts, `ethexe` restrictions, payable methods, public types, services, events, and build/test expectations.
- `skills/vara-eth-app-builder/SKILL.md` for deploy, create, top-up, init, CLI, TypeScript, ABI interface, reply handling, state reads, and end-to-end workflows around an existing contract.
- `skills/vara-eth-full-app-builder/SKILL.md` for complete user-facing Vara.eth apps that combine contracts or artifacts, deploy/attach flows, TypeScript interaction modules, wallet/frontend UX, environment configuration, scripts, and full-flow validation.
- `skills/vara-eth-injected-app-builder/SKILL.md` for apps where browser wallet signing creates injected Vara.eth writes, setup uses executable balance and injected setup messages, and the frontend reads state through Vara.eth RPC.
- `skills/vara-eth-mirror-adapter-frontend-builder/SKILL.md` for browser frontends that call a Solidity adapter through normal Ethereum wallet transactions while the adapter calls an ABI-enabled Vara.eth Mirror asynchronously and callbacks finalize adapter state.
- `skills/vara-eth-solidity-integrator/SKILL.md` for Solidity contracts that call Vara.eth through generated ABI interfaces and handle async callbacks.

Use `playbooks/` for detailed task flows and `references/` for reusable source maps and checklists.

## Examples

Examples are verification references, not mandatory templates:

- `examples/vault` demonstrates a Rust/Sails Vara.eth contract plus CLI, TypeScript, and ABI interaction flows.
- `examples/escrow` demonstrates a Solidity adapter that holds ETH while a Vara.eth program confirms asynchronous state transitions.
- `examples/digit-recognition-injected-frontend` demonstrates a browser app where writes enter through injected Vara.eth transactions and state is confirmed through Vara.eth reads.

When adding examples:

- Keep private keys and live addresses out of committed files.
- Prefer placeholders for RPC endpoints, Router addresses, program ids, code ids, and salts.
- State whether value is ETH/ERC20 in Solidity, Vara.eth native value, or wVARA executable balance.
- For Solidity adapters, store `messageId -> operation context` and restrict callbacks to the trusted generated ABI/Mirror contract.

## Vara.eth Source Of Truth

Primary implementation repository:

```text
https://github.com/gear-tech/gear.git
```

Use the `ethexe/` subtree as the primary implementation source for Vara.eth behavior.

Canonical implementation areas:

- Contracts: `ethexe/contracts/src`
- ABIs/artifacts: `ethexe/ethereum/abi`
- CLI: `ethexe/cli/src`
- RPC server: `ethexe/rpc/src`
- Rust SDK wrappers: `ethexe/sdk/src`
- Runtime and processing: `ethexe/runtime`, `ethexe/processor`, `ethexe/service`

## Validation

Prefer task-specific validation:

- contract changes: `cargo build --release` and `cargo test --release`
- TypeScript examples: `npm run check` from the example folder
- Solidity adapter examples: `forge build` or another Solidity compiler check when available
- ABI interface examples: regenerate with `cargo sails sol --idl-path ...` after IDL changes
- deploy/interact flows: verify against the current `ethexe` binary and live output when a network is involved
- full app flows: run contract checks, package checks, and UI or smoke-flow verification when practical
- documentation changes: verify claims against the implementation source above

# Vara.eth Skills

Tool-agnostic playbooks and agent skills for Vara.eth contract authoring, deployment, interaction, integration, and full application building.

The canonical guidance lives in:

- `playbooks/` for task workflows
- `references/` for source maps and checklists
- `skills/` for self-contained agent-facing task instructions
- `examples/` for runnable examples used to verify the workflows

## Repository Layout

- `playbooks/vara-eth-abi-interface.md` - workflow for generating a Solidity ABI interface and using a Vara.eth contract through ABI-aware Ethereum tooling
- `playbooks/vara-eth-ethexe-cli-workflow.md` - step-by-step `ethexe` CLI workflow for upload, validation, create, top-up, initialization, query, and message sending
- `playbooks/vara-eth-full-app-workflow.md` - workflow for building a full user-facing Vara.eth app around verified contract, deploy, interaction, wallet, frontend, and validation paths
- `playbooks/vara-eth-injected-app-workflow.md` - workflow for deploying, activating, and building apps that send writes through injected Vara.eth transactions and read state through Vara.eth RPC
- `playbooks/vara-eth-mirror-adapter-frontend-workflow.md` - workflow for browser frontends that call a Solidity adapter backed by an ABI-enabled Vara.eth Mirror
- `playbooks/vara-eth-ts-api-workflow.md` - step-by-step TypeScript workflow with `@vara-eth/api`, `viem`, and Sails-generated payloads
- `references/contract-writing-checklist.md` - final review checklist for Vara.eth contract authoring
- `references/source-map.md` - canonical implementation locations in the `ethexe/` subtree
- `references/flow-checks.md` - practical checks for deploy/interact examples
- `references/error-log.md` - reusable troubleshooting notes collected from Vara.eth app, frontend, deploy, and ABI integration work
- `skills/vara-eth-contract-writer` - self-contained skill for writing Rust Sails contracts for Vara.eth
- `skills/vara-eth-app-builder` - self-contained skill for deploy and integration flows around an existing contract
- `skills/vara-eth-full-app-builder` - self-contained skill for complete user-facing Vara.eth apps that include contract, interaction, wallet/frontend, configuration, scripts, and validation
- `skills/vara-eth-injected-app-builder` - self-contained skill for injected-transaction apps that use wallet signing for Vara.eth writes and Vara.eth RPC for state reads
- `skills/vara-eth-mirror-adapter-frontend-builder` - self-contained skill for frontends that write to Solidity adapters and read both adapter and Vara.eth state
- `skills/vara-eth-solidity-integrator` - self-contained skill for Solidity contracts that call Vara.eth through generated ABI interfaces and async callbacks
- `examples/digit-recognition-injected-frontend` - frontend-only example that sends a digit-recognition write through injected Vara.eth transactions and reads state through Vara.eth RPC
- `examples/vault` - runnable contract, CLI, TypeScript, and ABI workflow example
- `examples/escrow` - simple Solidity escrow adapter backed by a Vara.eth async order engine

## Source Of Truth

Primary implementation repository:

```text
https://github.com/gear-tech/gear.git
```

Vara.eth implementation lives in the `ethexe/` subtree of that repository. Use that implementation as the source of truth for CLI behavior, runtime behavior, RPC methods, Router/Mirror contracts, and deploy/interact lifecycle details.

When a requested TypeScript SDK behavior is not implemented under `ethexe/`, verify it in its own repository instead of inferring it from documentation.

## How To Use

Start with the skill that matches the task:

- contract authoring: `skills/vara-eth-contract-writer/SKILL.md`
- deploy, interaction, or integration around an existing contract: `skills/vara-eth-app-builder/SKILL.md`
- complete user-facing app or dApp: `skills/vara-eth-full-app-builder/SKILL.md`
- injected-transaction frontend or app flow: `skills/vara-eth-injected-app-builder/SKILL.md`
- browser frontend through a Solidity adapter backed by a Vara.eth Mirror: `skills/vara-eth-mirror-adapter-frontend-builder/SKILL.md`
- Solidity contracts that integrate with Vara.eth ABI callbacks: `skills/vara-eth-solidity-integrator/SKILL.md`

Use `playbooks/` for detailed full-app, CLI, TypeScript, and ABI workflows once the selected skill chooses the path.

Use `examples/` as runnable references, not as mandatory templates. The `vault` example verifies contract, CLI, TypeScript, and ABI workflows. The `escrow` example verifies the general Solidity callback pattern where Solidity holds funds and Vara.eth confirms asynchronous state transitions.

## Validation

This repository is intentionally tool-agnostic. Validate changes by checking the Markdown, running the runnable examples where relevant, and keeping `SKILL.md` frontmatter simple enough for different agents to consume.

For contract examples:

```bash
cargo build --release
cargo test --release
```

For the `vault` TypeScript example:

```bash
cd examples/vault
npm run check
```

For full app work, run the app's package checks and then verify the user flow through the UI or a smoke script when a dev server or live network is involved.

For the digit-recognition injected frontend example:

```bash
cd examples/digit-recognition-injected-frontend
npm run check
npm run build
```

For the `escrow` contract example:

```bash
cd examples/escrow
cargo build --release
cargo sails sol --idl-path target/wasm32-gear/release/order_escrow.idl
```

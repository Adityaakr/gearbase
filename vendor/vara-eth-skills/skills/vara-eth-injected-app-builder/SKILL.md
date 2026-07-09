---
name: vara-eth-injected-app-builder
description: Build, repair, deploy, activate, or review Vara.eth apps that use injected transactions for writes and Vara.eth RPC state reads. Use when Codex is asked to make a browser/frontend dApp where MetaMask or another EIP-1193 wallet signs an injected Vara.eth transaction, when configuring `createInjectedTransaction`, when preparing an existing Rust/Sails program for injected frontend use, or when measuring injected transaction latency/cost through executable balance reads.
---

# Vara.eth Injected App Builder

Use this skill for full injected-transaction application flows: deploy or attach a program, top up executable balance, initialize, seed required state, build the frontend interaction layer, send injected writes, read Vara.eth state, and verify the end-to-end user path.

## Start Here

Read `../../playbooks/vara-eth-injected-app-workflow.md` before implementing or documenting the flow.

Use supporting skills only for the slice that applies:

- Contract behavior changes: `../vara-eth-contract-writer/SKILL.md`.
- General CLI, TypeScript, ABI, replies, state reads: `../vara-eth-app-builder/SKILL.md`.
- Broader product/UI packaging beyond injected writes: `../vara-eth-full-app-builder/SKILL.md`.
- Solidity adapter or callback flows: `../vara-eth-solidity-integrator/SKILL.md`.

Use `../../references/flow-checks.md` as the final checklist.

## Core Rule

Do not treat a frontend injected transaction as just a button plus wallet connect. A usable app needs:

- a program created on the intended Router from validated code,
- executable balance,
- init success,
- required setup/state seeding,
- a typed payload and state-read layer,
- wallet signing for injected writes,
- separate UI states for signing, promise waiting, state read, and confirmation.

## Workflow

1. Confirm the target architecture: injected writes plus Vara.eth state reads.
2. Verify the Router, Ethereum RPC, Vara.eth RPC, sender, and existing artifacts. If the user wants fresh code, ignore stale `CODE_ID` values and upload the current `.opt.wasm`.
3. Build artifacts if needed with `cargo build --release`; locate `.opt.wasm` and `.idl`.
4. Use `ethexe tx upload --watch` and wait for validation approval.
5. Create the program from the validated `code_id`; capture `actor_id` as the program id.
6. Top up executable balance with wVARA and wait for mirror state change.
7. Initialize with an IDL/generated-client encoded constructor payload. Do not guess constructor bytes.
8. Send required setup messages through injected transactions only when they carry zero ETH value; verify each reply.
9. Smoke-read program-specific state to prove readiness.
10. Build or repair the frontend interaction module before UI components.
11. Wire the UI to wallet connect, injected submit, promise validation, state read, errors, and timing/cost instrumentation.
12. Run TypeScript checks and any available build/test commands.

## Frontend Pattern

Use the browser wallet as an EIP-1193 signer, not as proof that the app is using normal Ethereum transactions.

The interaction layer should:

- request accounts with `eth_requestAccounts`,
- create an Ethereum `publicClient` from the Ethereum RPC,
- create a wallet client from `custom(window.ethereum)`,
- convert it to a Vara.eth signer,
- create `VaraEthApi` with a `WsVaraEthProvider` for the Vara.eth RPC,
- encode Sails payloads outside React components,
- submit writes with `api.createInjectedTransaction({ destination, payload, value: 0n })`,
- wait with `sendAndWaitForPromise()`,
- validate the promise signature,
- read results with `calculateReplyForHandle(...)`.

Keep RPC URLs, Router address, and Program ID in env/config placeholders. Do not commit private keys or personal live addresses.

## Operational Checks

For deploy/activation, verify these observable signals:

- upload receipt,
- validation approval,
- create receipt and returned `actor_id`,
- executable-balance top-up state change,
- init reply code,
- setup injected reply codes,
- program-specific state read.

For frontend, verify:

- missing config does not crash the app,
- wallet connection errors are visible,
- injected submit is distinct from state read,
- result read happens after the injected promise,
- UI exposes failed promise/reply states,
- `npm run check` or the local package check passes.

## Measuring Cost

To measure one injected action:

1. Read mirror state and record `executable_balance` and `state_hash`.
2. Send the injected transaction and wait for the promise.
3. Poll mirror state until `state_hash` or `executable_balance` changes.
4. Compute `before - after` in raw units and format with 12 wVARA decimals.

Do not assume the balance immediately after `sendAndWaitForPromise()` is final.

## Common Pitfalls

- Uploading to the wrong Router from a stale `.env.example`.
- Using old code ids when the requested task is to deploy fresh code.
- Forgetting executable balance before init or injected messages.
- Mixing IDL parser versions with the generated IDL syntax.
- Sending injected messages with non-zero ETH value.
- Showing success after the promise while the app still needs a state read.
- Measuring cost without waiting for state visibility.

## Final Response

Report:

- Router, code id, program id, and whether they are placeholders or live values.
- Which activation steps completed.
- Which injected messages and state reads verified readiness.
- Which checks ran.
- Any remaining manual wallet or network actions.

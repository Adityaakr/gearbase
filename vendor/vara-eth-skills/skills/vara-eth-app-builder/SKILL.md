---
name: vara-eth-app-builder
description: Build and verify Vara.eth deploy, interaction, and integration examples after a contract already exists. Use when an AI agent is asked to upload or create a program, initialize it, fund executable balance, send messages, read state, handle replies, use `ethexe` CLI, script flows with `@vara-eth/api`, or create/interact through a Solidity ABI interface.
---

# Vara.eth App Builder

Use this skill after a Vara.eth contract already exists. Contract authoring belongs to `vara-eth-contract-writer`; complete user-facing applications belong to `vara-eth-full-app-builder`. This skill starts from built artifacts, IDL, code id, program id, Router/Mirror addresses, or integration requirements.

## Choose The Flow

Pick the narrowest workflow for the task:

- Direct CLI lifecycle: read `../../playbooks/vara-eth-ethexe-cli-workflow.md`.
- Scripted TypeScript lifecycle: read `../../playbooks/vara-eth-ts-api-workflow.md`.
- Solidity ABI interface lifecycle: read `../../playbooks/vara-eth-abi-interface.md`.
- Injected browser/frontend lifecycle: use `../vara-eth-injected-app-builder/SKILL.md`.
- Solidity adapter frontend lifecycle: use `../vara-eth-mirror-adapter-frontend-builder/SKILL.md`.
- Complete user-facing app lifecycle: use `../vara-eth-full-app-builder/SKILL.md`.
- Solidity contract adapter or callback handler: use `../vara-eth-solidity-integrator/SKILL.md`.

Use `../../references/source-map.md` when a claim depends on implementation details. Use `../../references/flow-checks.md` as the final review checklist for deploy/interact examples.

## Shared Rules

- Build examples from verified public surfaces, not guessed helper APIs.
- Keep placeholders explicit for private keys, sender addresses, Router addresses, RPC endpoints, salts, code ids, program ids, and ABI interface addresses.
- Do not print real private keys in reusable examples.
- Separate current behavior from planned or future behavior.
- State whether a flow uses Router, Mirror, direct Sails payloads, generated Solidity ABI, or TypeScript helpers.
- Use Vara units carefully: wVARA has 12 decimals, so `1 WVARA = 1000000000000`.
- Confirm whether a step uses owned balance, executable balance, native value, or wVARA.
- For message processing, executable balance top-up may be required even when program creation already succeeded.
- For networked flows, verify the observable result, not only that a transaction was submitted.

## `ethexe` Binary

For deploy and interaction flows, require the `ethexe` binary explicitly.

It can be obtained by either:

- building from source after `git clone https://github.com/gear-tech/gear.git`, or
- downloading from `https://get.gear.rs/#vara-eth`.

Before documenting exact CLI commands, verify real command names, flags, and output fields against the current binary or implementation.

## CLI Flow Summary

Use the CLI playbook for the exact sequence. The expected shape is:

1. Import the sender key with `ethexe key keyring import --private-key ...`.
2. Run `ethexe tx` with shared flags before the subcommand: `--ethereum-rpc`, `--ethereum-router`, and `--sender`.
3. Upload code with `upload --watch` and treat approval as the validation gate.
4. Capture the returned `code_id`.
5. Create the program with `create` or `create-with-abi`.
6. Top up executable balance when required.
7. Initialize the program.
8. Query state or send messages and verify replies/output.

Do not skip validation or create a program from an unapproved code id.

## TypeScript Flow Summary

For TypeScript examples, prefer small runnable scripts over broad app scaffolds.

Use the verified shape from the TS playbook:

- `createVaraEthApi(...)` for Vara.eth helpers.
- `getMirrorClient({ address, publicClient, signer })` for Mirror interaction.
- `SailsProgram` plus `SailsIdlParser` from `sails-js/parser` for IDL v2.
- `program.setProgramId(...)` before encoding, decoding, calls, or queries that need the program id.
- `program.setApi(gearApi)` only when using SailsProgram's own `@gear-js/api`-backed calls; do not pass the `@vara-eth/api` object to `setApi`.
- Hex Sails payloads for `mirror.sendMessage(...)`.
- `setupReplyListener()` followed by `await waitForReply()`.

For IDL v2 parsing, use `sails-js` from the verified GitHub release tarball unless a newer release has been checked:

```json
{
  "sails-js": "https://github.com/gear-tech/sails/releases/download/js/v1.0.0-beta.1/sails-js.tgz"
}
```

Do not use the old standalone `sails-js-parser` package for IDL v2 examples.

## ABI Flow Summary

Do not call direct `mirror.sendMessage(...)` plus Sails IDL payloads an ABI flow.

An ABI-enabled workflow has these pieces:

1. Generate a Solidity ABI interface from the Sails IDL.
2. Deploy the generated ABI interface contract.
3. Create the Vara.eth program with `createProgramWithAbiInterface(...)` and the deployed ABI interface address.
4. Top up executable balance before init or message processing when required.
5. Initialize and call the program through ABI-facing Ethereum tooling or generated bindings.
6. Poll or repeat read-only checks when verifying state.

Ethereum transaction receipts can arrive before Vara.eth state is visible through read-only calls. Examples should make this explicit and verify state with polling or repeated reads where needed.

For Solidity contracts that call an ABI-enabled Vara.eth program, treat the Ethereum call as asynchronous. Store the returned `messageId`, complete local Solidity state only from trusted callbacks, and keep ETH value, Vara.eth native value, and wVARA executable balance separate.

When verifying ABI callbacks, include at least one method that returns a value and one method that returns unit/empty output. If Vara.eth state changes but the Solidity adapter remains pending, inspect Mirror `ReplyCallFailed` events and decode the reply payload selector. A success reply can still fail at the Solidity callback layer because the adapter implements `replyOn_...(bytes32)` while the actual unit-return payload selects `replyOn_...(bytes32,())`.

## Replies And State Reads

Decode reply codes in runnable examples:

- `0x00000000` = success, auto reply.
- `0x00010000` = success, manual reply.

For state reads, verify the expected source:

- Sails queries through `calculateReplyForHandle` or equivalent query helpers.
- ABI-facing reads through the generated Solidity ABI interface.
- Mirror interactions through Sails payloads and reply listeners.

When querying by account, be explicit about Ethereum address versus `ActorId` conversion. Ethereum addresses are 20 bytes; `ActorId` is 32 bytes.

## Implementation Checks

Before naming an API, command, event, field, or flag, verify the relevant implementation area:

- Contract names, function names, events, payable behavior, and errors: `contracts/src` or `ethereum/abi`.
- CLI commands, flags, defaults, and output fields: `cli/src`.
- JSON-RPC methods, params, result fields, and errors: `rpc/src`.
- Runtime behavior such as executable balance, owned balance, pre-confirmation state, init restrictions, and reply handling: `runtime`, `processor`, and `service`.
- Rust SDK wrappers: `sdk/src`.
- TypeScript SDK behavior outside `ethexe`: verify in its own repository before treating it as public API.

## Example Quality Bar

Examples should include:

- Required inputs and environment variables.
- Exact command or call.
- Expected success signal.
- Expected output fields.
- Known failure modes.
- What was verified and what remains unverified.

Keep examples minimal enough to run or adapt, and scoped to an already-written contract.

# Vara.eth Full Application Workflow

Use this playbook when the goal is a user-facing Vara.eth application, not only a contract, deploy script, or one-off interaction example.

## Core Rule

Build the app as a coherent product surface around verified Vara.eth behavior.

A complete app should make these boundaries explicit:

- Rust/Sails contract behavior and artifacts.
- Program lifecycle: upload, validation, create, top-up, init, and interaction.
- User-facing interaction path: direct Mirror/Sails payloads, generated Solidity ABI, or Solidity adapter callbacks.
- Optional injected transaction path: wallet-signed Vara.eth writes submitted through Vara.eth RPC, followed by state reads.
- Frontend wallet and network handling.
- Async status: Ethereum transaction, Vara.eth reply, and state visibility.
- Required configuration, scripts, and validation commands.

Do not hide deploy or funding assumptions inside the frontend. Do not treat an Ethereum receipt as final Vara.eth state unless a reply or repeated state read confirms it.

## Choose The Architecture

Pick one primary integration path:

- Direct Mirror app: frontend or scripts use `@vara-eth/api`, `getMirrorClient(...)`, Sails IDL payloads, reply listeners, and query helpers.
- Injected app: frontend or scripts use `@vara-eth/api`, `createInjectedTransaction(...)`, wallet signing, Vara.eth RPC promise waiting, and explicit state reads.
- ABI-enabled app: deploy the generated Solidity ABI interface, create the program with ABI enabled, call the mirror through Ethereum ABI tooling, and poll state when needed.
- Solidity adapter app: Solidity holds ETH/ERC20 or user-facing state, calls an ABI-enabled Vara.eth program, stores `messageId -> operation context`, and completes local state only from trusted callbacks.
- Mirror adapter frontend: browser users call the Solidity adapter through normal Ethereum wallet transactions; the UI polls adapter state for callbacks and may read Vara.eth state through Vara.eth RPC for confirmation.

Use direct Mirror/Sails when the app is primarily TypeScript-driven and normal Ethereum Mirror transactions are acceptable. Use injected apps when browser users should sign a Vara.eth injected transaction and no ETH value is sent with the write. Use ABI-enabled flows when Ethereum tooling, Etherscan, ethers.js, Foundry, or Solidity callers are first-class. Use a Solidity adapter when funds, permissions, or local Ethereum state must live on Ethereum.

## App Skeleton

A useful full application usually includes:

- Contract package or reference to existing contract artifacts.
- Generated `.idl`, `.wasm`, and `.opt.wasm` expectations.
- A typed TypeScript interaction module that owns Vara.eth API setup, payload encoding, reply waiting, state reads, and reply-code decoding.
- Frontend wallet connection, signer creation, network configuration, and account display.
- UI states for disconnected, wrong network, missing configuration, insufficient executable balance, transaction pending, reply pending, confirmed, and failed.
- Scripts for build, typecheck, create or attach, top-up, init, smoke read, and app check.
- `.env.example` with placeholders for RPC endpoints, Router, program id, code id, ABI interface address, and optional salts.
- README that states prerequisites, setup, commands, what was verified, and what still requires a live network.

Only add a backend when the product actually needs one. If a backend signs transactions or relays user operations, document custody, permissions, rate limits, and failure modes.

## Workflow

1. Define the user workflow before changing code: who connects, what they do, what state proves success, and which async states the UI must show.
2. Locate or create the contract artifacts. If the contract changes, use `skills/vara-eth-contract-writer/SKILL.md`.
3. Select the integration path. For direct CLI, TypeScript, or ABI lifecycle details, use `skills/vara-eth-app-builder/SKILL.md` and the matching deploy/interact playbook.
4. Build a small interaction layer before UI work. Keep Sails IDL parsing, payload encoding, `mirror.sendMessage(...)`, `setupReplyListener()`, `waitForReply()`, `calculateReplyForHandle(...)`, and ABI calls outside view components.
5. Wire the UI to typed actions and reads. Surface reply codes and state-read results, not only transaction hashes.
6. Add operational scripts and placeholders. Never commit private keys, live personal addresses, or local machine paths.
7. Verify the app from the command line first, then through the UI.

## Frontend Rules

- Do not ask users to paste private keys into a browser app. Use wallet signing for frontend flows.
- Keep RPC URLs, Router addresses, program ids, code ids, and ABI interface addresses configurable.
- Distinguish ETH value sent to payable messages from wVARA executable balance.
- Show executable-balance/top-up requirements before users submit messages when the app can detect them.
- For ABI-facing writes, show transaction submitted, transaction confirmed, Vara.eth pending, and state confirmed as separate states when possible.
- For injected writes, show wallet connection, signing, injected promise pending, state read pending, and confirmed as separate states.
- Convert Ethereum `address` and Vara.eth `ActorId` explicitly when account ids appear in state reads.
- Decode known reply codes: `0x00000000` for success auto reply and `0x00010000` for success manual reply.

## Verification

Before treating a full app as ready, run the relevant checks:

- Rust contract: `cargo build --release` and `cargo test --release`.
- TypeScript/frontend: package typecheck and lint/test commands when available.
- ABI path: `cargo sails sol --idl-path ...` after IDL changes, plus Solidity compiler check when an adapter is included.
- Deploy/interact scripts: smoke-test against the current `ethexe` binary or a live network when the task requires network proof.
- UI: run the local dev server and verify wallet, action, reply, and state-read flows manually or with browser automation when practical.

Record which checks were run and which parts still need live network validation.

## Common Failure Modes

- Building only a contract and leaving no usable path for users to initialize or interact with it.
- Putting deploy secrets or live private keys into reusable examples.
- Letting UI components hand-build Sails payloads instead of using a shared interaction module.
- Showing success after Ethereum receipt while Vara.eth state is still pending.
- Forgetting executable-balance top-up before init or message processing.
- Mixing ETH value, Vara.eth native value, and wVARA executable balance in labels or docs.
- Calling a Solidity adapter callback without checking the trusted ABI/Mirror contract sender.
- Copying the `vault` or `escrow` business model when the requested app needs a different domain model.

## Pairing

Use this playbook together with:

- `skills/vara-eth-contract-writer/SKILL.md` when contract behavior changes.
- `skills/vara-eth-app-builder/SKILL.md` for CLI, TypeScript, ABI, deploy, init, top-up, reply, and state-read details.
- `skills/vara-eth-injected-app-builder/SKILL.md` when writes use injected Vara.eth transactions and frontend state reads.
- `skills/vara-eth-mirror-adapter-frontend-builder/SKILL.md` when a browser frontend writes to a Solidity adapter backed by an ABI-enabled Vara.eth Mirror.
- `skills/vara-eth-solidity-integrator/SKILL.md` when a Solidity adapter or callback handler is part of the app.
- `references/flow-checks.md` for final deploy/interact checks.

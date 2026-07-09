# Vara.eth App Flow Review Checklist

Use this checklist before treating a deploy, interaction, integration example, or full app as ready.

## Setup

- Required binaries, packages, and install commands are verified.
- The `ethexe` binary is required explicitly for CLI deploy/interact flows.
- `ethexe` installation is described as either building from `https://github.com/gear-tech/gear.git` or downloading from `https://get.gear.rs/#vara-eth`.
- Chain id, RPC endpoint, Router address, sender address, program id, code id, and ABI interface address are placeholders unless confirmed for the example.
- Private keys are never hard-coded in reusable docs or examples.
- TypeScript examples that parse IDL v2 use `SailsIdlParser` from `sails-js/parser`.
- IDL v2 examples do not use the old standalone `sails-js-parser` package.
- TypeScript examples are run from the package directory where the verified `sails-js` dependency is installed.

## Deploy

- The flow clearly states whether it uses Router, Mirror, direct Sails payloads, or a Solidity ABI interface.
- Code upload and validation happen before program creation.
- CLI examples place `--ethereum-rpc`, `--ethereum-router`, and `--sender` on `ethexe tx` before the subcommand.
- Sender setup uses `ethexe key keyring import --private-key ...` when CLI key import is needed.
- `upload --watch` is treated as the validation gate and returns a `code_id` before `create` or `create-with-abi`.
- ABI-enabled creation deploys the generated ABI interface first and passes its address to `createProgramWithAbiInterface(...)`.
- Salt, initializer, and address derivation claims are verified or left as placeholders.
- The example states whether it needs native value, wVARA, owned balance, or executable balance.
- wVARA uses 12 decimals.
- ABI-enabled mirrors still include executable balance top-up before init and message processing when required.

## Interact

- TypeScript examples use `createVaraEthApi(...)` and `getMirrorClient({ address, publicClient, signer })` where appropriate.
- Sails IDL examples use `SailsProgram`, `SailsIdlParser`, and `program.setProgramId(...)`. Use `program.setApi(gearApi)` only for SailsProgram's own `@gear-js/api`-backed calls; do not pass an `@vara-eth/api` object to `setApi`.
- Direct Mirror message examples pass hex Sails payloads to `mirror.sendMessage(...)`.
- Reply listener examples call `setupReplyListener()` and then `await waitForReply()`.
- Common reply codes are decoded: `0x00000000` for success auto reply and `0x00010000` for success manual reply.
- ABI-facing examples do not assume an Ethereum receipt means Vara.eth read-only state is already visible; they poll or repeat state reads where needed.
- Solidity adapter UIs distinguish adapter storage reads through Ethereum RPC from Vara.eth program queries through Vara.eth RPC, especially when showing callback-confirmed state.
- Solidity adapter examples store `messageId -> operation context` before relying on callbacks.
- Solidity callback handlers restrict `msg.sender` to the trusted generated ABI/Mirror contract.
- Solidity examples state whether user funds stay in Solidity, are sent as Vara.eth native value, or are only used as wVARA executable balance.
- Solidity adapter frontends handle wallet `accountsChanged` and `chainChanged`, recreate the wallet session, and reread role-specific or account-scoped adapter state.
- Solidity adapter frontends poll adapter state after Ethereum receipts until callback-confirmed state or error state is visible.
- Solidity adapter frontends include adapter custom errors in the ABI used for simulations and writes.
- Caller restrictions and failure cases are stated when relevant.
- Event names and parameters are checked from contracts or ABI artifacts.
- Ethereum address versus `ActorId` conversion is explicit when account ids are used in queries.

## Full App

- The app has a clear integration path: direct Mirror/Sails payloads, ABI-enabled mirror, or Solidity adapter callbacks.
- Injected transaction apps state that browser wallet connection is used for address and signing, while writes are submitted to Vara.eth RPC through `createInjectedTransaction(...)`.
- Injected transaction apps keep Ethereum RPC, Vara.eth RPC, Router address, and Program ID configurable.
- Injected transaction apps verify executable balance before user writes when possible.
- Injected transaction apps wait for the injected promise/reply and then perform a separate state read for the user-visible result.
- Cost measurements for injected actions read `executable_balance` before the action and after a changed `state_hash` or changed balance, not immediately after the promise.
- UI components call a typed interaction layer instead of hand-encoding Sails payloads inline.
- Wallet-based frontend flows do not ask users to paste private keys.
- Required configuration is represented in `.env.example` or equivalent placeholder docs.
- User-visible states distinguish wallet disconnected, wrong network, transaction pending, reply pending, state pending, confirmed, and failed when those states apply.
- Ethereum transaction receipt, Vara.eth reply, and state-read confirmation are treated as separate milestones.
- Executable-balance requirements are visible in docs, scripts, or UI before users send messages when the app can detect them.
- App scripts cover build or typecheck, create or attach, top-up, init, and smoke read where relevant.
- The README or app docs state which checks were run and which pieces require live network credentials or manual wallet interaction.

## Outputs

- Required inputs are listed.
- Exact commands or calls are shown.
- Expected success signals are described.
- Expected output fields are named.
- Known failure modes are included.
- New recurring failures are added to `references/error-log.md` with symptom, cause, fix, and prevention notes.
- Source files or public surfaces checked are listed.

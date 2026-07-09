---
name: vara-eth-mirror-adapter-frontend-builder
description: Build, repair, or review browser frontends that interact with a Solidity adapter contract whose backend is an ABI-enabled Vara.eth Mirror/Program. Use when user writes go through normal Ethereum wallet transactions to an adapter, the adapter calls Vara.eth asynchronously, callbacks finalize adapter state, and the frontend must read both adapter state through Ethereum RPC and optional Vara.eth state through Vara.eth RPC.
---

# Vara.eth Mirror Adapter Frontend Builder

Use this skill for frontends where the browser does not send injected Vara.eth writes directly. Instead, users sign normal Ethereum transactions to a Solidity adapter, and the adapter calls an ABI-enabled Vara.eth Mirror/Program.

## Start Here

Read `../../playbooks/vara-eth-mirror-adapter-frontend-workflow.md` before implementing or documenting this flow.

Use supporting skills only for the slice that applies:

- Solidity adapter design or callback bugs: `../vara-eth-solidity-integrator/SKILL.md`.
- Upload, create-with-abi, top-up, init, CLI, TypeScript, or state reads: `../vara-eth-app-builder/SKILL.md`.
- Complete app packaging beyond this frontend path: `../vara-eth-full-app-builder/SKILL.md`.
- Injected Vara.eth writes: `../vara-eth-injected-app-builder/SKILL.md`.

Use `../../references/flow-checks.md` as the final checklist.

## Core Rule

Treat the UI as a bridge between two state machines:

- Adapter state on Ethereum: assets, permissions, local ids, account-scoped values, pending operations, finalized flags, and user roles.
- Vara.eth state: program status, computation/workflow result, and proof that the Mirror processed the operation.

Never show final success after only an Ethereum receipt. For adapter writes that call Vara.eth, wait for adapter state to reflect the callback or error callback.

## Required Frontend Shape

Create or repair a typed interaction module before working on UI components. It should own:

- config parsing with visible missing-config states,
- target chain definition and wallet chain switching,
- `createPublicClient(...)` for Ethereum reads,
- `createWalletClient({ account, chain, transport: custom(window.ethereum) })` for adapter writes,
- `WsVaraEthProvider` and `createVaraEthApi(...)` for optional Vara.eth reads,
- adapter ABI with functions, events, and custom errors,
- `simulateContract(...)` before writes when practical,
- event parsing for request events that include `messageId` and local ids,
- adapter state reads after receipts and during callback polling,
- Vara.eth query helpers only when the UI needs program-state confirmation.

Keep Sails payload encoding, ABI calls, event parsing, and reply-code handling out of React components.

## Environment

Use placeholders rather than live local values:

```text
VITE_ETHEREUM_RPC=
VITE_VARA_ETH_RPC=
VITE_ROUTER_ADDRESS=
VITE_ADAPTER_ADDRESS=
```

If the adapter exposes the Mirror address, read it from the adapter instead of duplicating `VITE_PROGRAM_ID`.

## Wallet Handling

The connected account must always match the account used for role checks, writes, and account-scoped adapter reads.

Frontend code must:

- request accounts with `eth_requestAccounts`,
- handle `accountsChanged`,
- handle `chainChanged`,
- recreate the session or wallet client after account or chain changes,
- reread adapter state for the new account,
- provide a manual reconnect or refresh action.

This is mandatory for apps with role-specific actions, account-specific follow-up actions, administrative controls, operator execution, or any action whose availability depends on the connected account.

## Adapter Action Flow

For each adapter write:

1. Check role and input constraints in the UI, while keeping Solidity authoritative.
2. Simulate the adapter call when possible.
3. Send the wallet transaction to the adapter.
4. Parse emitted request events to capture `messageId` and local ids.
5. Show Ethereum receipt as "submitted" or "request confirmed", not final success.
6. Poll adapter state until the item is finalized, failed, or still pending after timeout.
7. If available, read Vara.eth program state through Vara.eth RPC and show it separately.

Disable duplicate actions while adapter pending state says an operation is in flight.

## Reads

Read adapter storage through Ethereum RPC for:

- adapter address and configured Program ID,
- local domain records and ids,
- pending flags,
- account-scoped balances, entitlements, permissions, or limits,
- finalized/closed/failed flags,
- Ethereum-held ETH/ERC20 balances and allowances.

Read Vara.eth program state through Vara.eth RPC for:

- program status,
- computation result,
- workflow status,
- game or eligibility state,
- confirmation that the Mirror state changed.

Label these separately in UI and logs. If they disagree, debug callbacks before changing the read path.

## Callback-Aware UI

A callback-aware UI should have visible states for:

- wallet disconnected,
- wrong network,
- missing config,
- Ethereum transaction pending,
- callback pending,
- adapter state confirmed,
- Vara.eth state confirmed,
- failed or retryable.

For unit-return Vara.eth methods, verify the callback selector in a live or smoke flow. A final Vara.eth state with a pending adapter state can mean the Mirror emitted a callback selector such as `replyOn_<service><Method>(bytes32,())` while the adapter implements only `replyOn_<service><Method>(bytes32)`.

## Account-Scoped Actions

For account-scoped actions, enable the action only from adapter state keyed by the connected account or its current role.

When an expected action is unavailable:

- compare adapter state for the expected actor and the connected account,
- check adapter finalized, failed, pending, or otherwise app-specific status,
- check callback event emission,
- check current wallet account,
- check whether the frontend session account is stale,
- reread state after `accountsChanged`.

## Validation

Run relevant checks before finishing:

- `npm run check` for the frontend package.
- `npm run build` when the app has a build script.
- Solidity adapter build, usually `forge build`, when adapter code changed.
- A live or scripted smoke read that verifies the adapter points to the intended Program ID.
- A live smoke flow when credentials and wallet access are available: submit an app action, wait for callback-confirmed adapter state, compare adapter state and Vara.eth state, and execute any account-scoped follow-up action the app requires.

If live network validation is blocked by missing wallet, RPC, or deploy credentials, say exactly which part is unverified.

## Final Response

Report:

- that the path is Solidity adapter plus ABI-enabled Vara.eth Mirror, not injected transactions,
- which config keys and deployed addresses are required,
- which files changed,
- which checks passed,
- which live wallet or network steps remain.

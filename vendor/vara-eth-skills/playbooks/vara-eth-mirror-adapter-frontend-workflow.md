# Vara.eth Mirror Adapter Frontend Workflow

Use this playbook when a browser frontend talks to a Solidity adapter contract, and that adapter calls an ABI-enabled Vara.eth Mirror/Program contract.

This is different from an injected Vara.eth frontend. User writes are normal Ethereum wallet transactions to the adapter. The adapter submits async Vara.eth messages to the Mirror. The final local result appears only after the trusted Mirror callback updates adapter storage.

## Architecture

The frontend has two read paths and one write path:

- Ethereum write path: browser wallet signs app-specific adapter calls.
- Ethereum read path: `publicClient.readContract(...)` reads adapter storage such as local ids, pending operations, account-scoped values, or finalized flags.
- Vara.eth read path: `VaraEthApi` plus `calculateReplyForHandle(...)` reads program state from the Vara.eth RPC when the UI needs proof that the Mirror state changed.

Do not treat an Ethereum receipt as final app success. For adapter flows, a receipt usually means "request submitted". Finality for the user-visible adapter state comes from either:

- a success callback from the ABI-enabled Mirror to the adapter, or
- `onErrorReply(...)` marking a failed or retryable operation.

## Preconditions

Before building the frontend, confirm these pieces exist or are represented as placeholders:

- generated Solidity ABI interface from the Sails IDL,
- deployed ABI interface contract,
- ABI-enabled Program ID / Mirror created with `create-with-abi` or `createProgramWithAbiInterface(...)`,
- executable balance topped up for the Mirror,
- initialized Vara.eth program,
- deployed Solidity adapter whose constructor or config points to the ABI-enabled Program ID,
- adapter ABI that includes functions, events, and custom errors.

`ethexe` can upload code, create the ABI-enabled Mirror, top up executable balance, initialize, send messages, and query state. It does not deploy arbitrary Solidity adapter contracts. Deploy the adapter with normal Ethereum tooling such as Foundry, Hardhat, viem, or a wallet-based deployment flow.

## Configuration

A frontend should keep network and deployment values in environment/config placeholders:

```text
VITE_ETHEREUM_RPC=
VITE_VARA_ETH_RPC=
VITE_ROUTER_ADDRESS=
VITE_ADAPTER_ADDRESS=
```

If the adapter exposes the Mirror address, prefer reading it from the adapter, for example `VARA_ETH_PROGRAM()`, rather than duplicating `VITE_PROGRAM_ID`. Add a Program ID env only when the adapter does not expose it or the UI needs to compare several programs.

Missing configuration should render a visible disabled state. It should not crash the React tree during initial render.

## Interaction Module

Keep wallet, ABI, reads, writes, event parsing, and Vara.eth query encoding outside UI components.

The module should usually provide:

- `readConfig()` that returns missing keys without throwing.
- `getConfig()` for action code that requires complete config.
- `connect()` or `connectSession()` that requests wallet accounts, switches/adds the target chain, creates viem clients, connects `WsVaraEthProvider`, and creates `VaraEthApi`.
- adapter reads such as `readAdapterSnapshot(...)`, local-record reads, account-scoped reads, or app-specific state reads.
- adapter writes that use `publicClient.simulateContract(...)`, then `walletClient.writeContract(...)`, then `waitForTransactionReceipt(...)`.
- event parsing helpers that extract `messageId`, local ids, or operation ids from request events.
- optional Vara.eth query helpers that encode the Sails query payload and call `calculateReplyForHandle(...)`.

Include adapter custom errors in the ABI passed to viem so failed simulations and writes can be decoded.

## Wallet And Account Handling

The active account controls role-specific UI such as participant, recipient, administrator, operator, or any app-defined actor.

Handle wallet changes explicitly:

- subscribe to `accountsChanged`,
- subscribe to `chainChanged`,
- recreate the session or wallet client after a change,
- reread adapter storage for the new account,
- reread role-specific and account-scoped adapter values,
- allow a manual reconnect path.

If an action looks unavailable after switching MetaMask accounts, check whether the frontend is still reading state for the previous session account.

## Async UI States

Model at least these states when the adapter sends async Vara.eth messages:

- disconnected or missing wallet,
- wrong chain or chain switch pending,
- missing config,
- Ethereum transaction requested,
- Ethereum transaction confirmed,
- Vara.eth callback pending,
- adapter state confirmed,
- Vara.eth state confirmed when the UI reads it directly,
- failed, reverted, or callback error.

Do not enable repeated actions while the adapter has a pending operation for the same logical item. If the adapter exposes pending state, read it and use it to disable duplicate submits.

## State Read Rules

Adapter state and Vara.eth state answer different questions.

Use adapter reads for user-facing adapter state:

- local domain record ids,
- assets, permissions, or app-specific values held in Solidity,
- account-scoped balances, entitlements, permissions, or limits,
- finalized or closed flag,
- failed flag,
- pending operation state,
- app-specific Ethereum balances or allowances.

Use Vara.eth reads for proof of program state:

- program-level status,
- computation result,
- eligibility result,
- game state,
- audit trail state,
- any state not mirrored into adapter storage.

When showing both, label them separately, for example:

```text
Adapter state: finalized = true, accountValue = 100
Vara.eth state: status = Computed
```

If Vara.eth state is final but adapter state is still pending, inspect Mirror callback logs before changing the frontend.

## Callback Verification

For every state-changing adapter action that calls the Mirror:

1. The adapter must store `messageId -> operation context` before relying on callbacks.
2. The callback must require `msg.sender == address(VARA_ETH_PROGRAM)` or the trusted generated ABI/Mirror address.
3. The callback must delete pending state exactly once.
4. The callback must update local adapter state or account-scoped values.
5. The frontend should poll adapter state until the local operation is finalized or failed.

For methods that return unit/empty output, test the actual callback payload. A unit-return success may arrive as `replyOn_<service><Method>(bytes32,())` even when generated stubs show `replyOn_<service><Method>(bytes32)`. If the Mirror emits `ReplyCallFailed` with a success reply code, compare the reply payload selector with the adapter implementation.

## Account-Scoped And Role-Specific Actions

For actions whose availability depends on an account, the UI should read adapter state for the connected account and the relevant app-defined role.

Debug unavailable actions by comparing:

- adapter state for the expected actor,
- adapter state for the connected account,
- app-defined role membership or permissions,
- adapter finalized, failed, pending, or equivalent status flags,
- whether the callback event was emitted,
- whether the frontend session account matches the wallet account.

After a successful account-scoped action, reread the adapter snapshot and any affected account or asset state.

## Validation

Before calling the frontend ready, run the checks that apply:

- Solidity adapter: `forge build` or the repo's Solidity build command.
- TypeScript/frontend: `npm run check`, plus `npm run build` when present.
- Vara.eth setup: query Mirror state and confirm `nonce`, initializer, and executable balance.
- Adapter wiring: read the adapter's configured Program ID and compare it to the intended Mirror address.
- Empty-state check: read local counters and confirm a fresh adapter starts cleanly.
- Smoke flow when live network and wallet access are available: submit an app action, wait for any value-return callback if applicable, run any follow-up unit-return action if applicable, verify adapter state, verify Vara.eth state, then execute any account-scoped follow-up action the app requires.

Record recurring failures in `references/error-log.md` with symptom, cause, fix, and prevention.

## Common Failure Modes

- The app reads adapter storage only and never verifies Vara.eth state when the UI says Vara.eth processing happened.
- The app reads Vara.eth state only and treats it as a local adapter result even though the adapter callback failed.
- The frontend uses an old session account after MetaMask switches accounts.
- An account-scoped action checks state for the wrong account.
- The wallet client is created without a chain, producing viem "No chain was provided" errors.
- The adapter ABI omits custom errors, so viem cannot decode reverts.
- `Buffer is not defined` appears because browser code imports Node-oriented IDL/parser dependencies into the runtime bundle.
- A unit-return callback updates Vara.eth state but does not update adapter state because the callback selector does not match.
- The UI allows repeated writes for the same logical operation while the first callback is pending.

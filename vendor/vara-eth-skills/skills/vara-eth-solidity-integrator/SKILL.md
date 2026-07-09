---
name: vara-eth-solidity-integrator
description: Design and review Solidity contracts that integrate with Vara.eth programs through generated Solidity ABI interfaces. Use when an AI agent is asked to build an Ethereum-side adapter, escrow, bridge-like flow, callback handler, or Solidity contract that calls a Vara.eth Mirror/ABI contract and processes async replies.
---

# Vara.eth Solidity Integrator

Use this skill when the task is about Solidity code that interacts with an existing Vara.eth program through a generated Solidity ABI interface.

Contract authoring in Rust/Sails belongs to `vara-eth-contract-writer`. Program upload, create, top-up, init, and TypeScript/CLI interaction belong to `vara-eth-app-builder`.

## Core Model

Treat Vara.eth calls from Solidity as asynchronous.

A generated ABI call returns a `bytes32 messageId`. That means the message was submitted, not that Vara.eth execution has finalized. The final result arrives through a generated success callback or `onErrorReply(...)`.

## Required Pattern

For every state-changing Vara.eth call from Solidity:

- Store `messageId -> operation context`.
- Include enough context to finish the operation later: user, local id, amount, operation kind, expected reply, or payout target.
- Verify callbacks with `msg.sender == address(VARA_ETH_PROGRAM)`.
- Delete pending state exactly once when a callback is accepted.
- Treat unknown `messageId` as an error.
- Emit events for requested, confirmed, and failed async operations.

Do not model pending operations as a single `pending[user]` value when the user can submit more than one operation before callbacks arrive.

## Value And Ownership

Be explicit about where each value type is held.

If Solidity sends native value into a Vara.eth payable method, the Vara.eth program sees the Solidity contract as the caller unless the program is explicitly designed to accept an original user in the payload.

For Ethereum-side applications, a common safe split is:

- Solidity contract holds ETH or ERC20 funds.
- Vara.eth program stores workflow, validation, scoring, or other application state.
- Solidity releases, refunds, credits, mints, or unlocks only after trusted Vara.eth callbacks.

This avoids pretending that the Vara.eth program automatically knows the original EVM user when the immediate caller is a Solidity adapter.

Executable balance is separate from ETH value. ABI-enabled Vara.eth programs still need enough wVARA executable balance for init and message processing.

## Callback Design

Success callbacks should complete local Solidity state transitions:

- mark a local operation confirmed
- release escrowed funds
- credit a claimable balance
- update local shares
- store a result returned by Vara.eth
- unblock a user action

Error callbacks should mark the operation failed or retryable. Do not promise a refund from `onErrorReply` unless value actually returned to the Solidity contract or the adapter has a separate refund reserve.

Prefer pull-style withdrawals or carefully bounded direct transfers. If a callback transfers value directly, update local state before the transfer and revert on transfer failure.

## Generated ABI Surface

Generate the Solidity ABI interface from the Sails IDL and treat the generated names as source of truth.

The usual shape is:

- service method: `<service>.<method>(...)`
- ABI function: `<service><Method>(bool callReply, ...)`
- callback: `replyOn_<service><Method>(bytes32 messageId, ...)`

Check the generated Solidity file before writing the adapter, especially method names, callback names, payable markers, and integer/address mappings.

For methods that return unit/empty values, do not trust the stub shape alone. Verify the actual success reply payload selector from a live or smoke flow. A unit-return method may arrive as `replyOn_<service><Method>(bytes32,())` even when a generated stub shows `replyOn_<service><Method>(bytes32)`. If the Mirror emits `ReplyCallFailed` with a success reply code, compare the payload selector with the adapter's implemented selector and add a restricted fallback or exact callback handler for the observed unit selector.

## Integration Shapes

Useful patterns include:

- Escrow or marketplace: Solidity holds funds, Vara.eth confirms workflow state.
- Reward pool: Solidity holds rewards, Vara.eth calculates eligibility or amount.
- Game or leaderboard: Solidity holds prize funds, Vara.eth stores scores or round state.
- Intent adapter: Solidity stores deposits or permissions, Vara.eth approves or rejects intents.
- Access or mint gate: Solidity mints/unlocks, Vara.eth checks eligibility.

Use `../../examples/escrow` only as a concrete reference for callback correlation and value separation. Do not copy its business model unless the requested integration is actually an escrow.

## Review Checklist

Before treating a Solidity integration as ready:

- All generated ABI names were checked against the current IDL output.
- Every async call stores a unique `messageId` context.
- Callback sender is restricted to the trusted ABI/Mirror contract.
- Unknown or repeated callbacks cannot complete an operation.
- Unit-return callbacks were tested against the actual reply payload selector; `ReplyCallFailed` on a success reply was investigated as a possible selector mismatch.
- Local user accounting does not assume Vara.eth sees the original EVM user.
- ETH value, wVARA executable balance, and Vara.eth native value are described separately.
- Error callbacks have an explicit retry, fail, or refund policy.
- The example states which parts are verified and which require deployment against a live ABI-enabled program.

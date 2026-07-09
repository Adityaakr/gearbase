# Vara.eth Injected Application Workflow

Use this playbook when the app writes to a Vara.eth program through injected transactions and reads state through Vara.eth RPC. It is for browser or TypeScript apps where the user signs with an Ethereum wallet, but the write is submitted directly to Vara.eth rather than as a normal Ethereum Mirror transaction.

## Core Rule

Treat an injected app as two connected flows:

- Operations flow: build, upload, validate, create, top up executable balance, initialize, seed app state, and smoke-read state.
- User flow: connect wallet for address and signing, encode a Sails payload, send an injected transaction, wait for the Vara.eth promise/reply, then read confirmed state.

Do not hide operations work inside the frontend. A browser app should attach to an already created, initialized, funded program unless it explicitly includes admin-only setup flows.

## What We Learned From The Digit Recognition Setup

The end-to-end flow that made the digit-recognition app usable was:

1. Build the Rust/Sails program and produce `.opt.wasm` and `.idl`.
2. Use the correct Router address for the target network. Do not trust stale `.env.example` values.
3. Upload the fresh `.opt.wasm` through `ethexe tx upload --watch`.
4. Wait for code validation approval and capture the returned `code_id`.
5. Create a new program from that `code_id` and capture the returned `actor_id` as `PROGRAM_ID`.
6. Top up executable balance with wVARA and wait for the mirror state change.
7. Initialize the program with the correct Sails constructor payload.
8. Seed required contract state with injected transactions when the messages carry no ETH value.
9. Verify a program-specific state read, not only transaction success. For digit recognition this was `LayersSet = [true, true, true, true]`.
10. Configure the frontend with Ethereum RPC, Vara.eth RPC, Router address, and Program ID.
11. In the browser, connect MetaMask only to get the account and signer; `Submit` sends `createInjectedTransaction(...)`, not a normal Ethereum write.
12. Read the result through Vara.eth state after the injected promise/reply succeeds.

## Inputs

Keep these configurable:

- `ETHEXE`: path or command name for the `ethexe` binary.
- `ETHEREUM_RPC`: Ethereum RPC endpoint for Router/Mirror calls and reference blocks.
- `VARA_ETH_RPC`: Vara.eth WebSocket RPC endpoint for injected submission, promises, and state reads.
- `ROUTER`: Router contract address for the target network.
- `SENDER`: Ethereum address whose private key is available in the `ethexe` key store for operational CLI steps.
- `WASM`: built optimized Wasm, usually `<target>/wasm32-gear/release/<program>.opt.wasm`.
- `IDL`: generated Sails IDL.
- `PROGRAM_ID`: created program/Mirror address after `create`.

Never commit private keys, live personal addresses, or machine-specific paths to reusable examples.

## 1. Build Artifacts

From the contract package:

```bash
cargo build --release
```

Expected artifacts include:

- `<program>.opt.wasm`
- `<program>.idl`

In a Cargo workspace, the `target/` directory may be at the workspace root instead of the package root. Locate the artifact explicitly before upload.

## 2. Upload And Validate Fresh Code

Run `ethexe tx` with shared flags before the subcommand. Add `--cfg none` when you need to avoid accidental local config values.

```bash
"$ETHEXE" --cfg none tx \
  --ethereum-rpc "$ETHEREUM_RPC" \
  --ethereum-router "$ROUTER" \
  --sender "$SENDER" \
  upload "$WASM" \
  --watch \
  --json
```

Wait for both:

- Ethereum upload receipt.
- Code validation approval.

Capture `code_id` only after validation succeeds.

## 3. Create Program

```bash
"$ETHEXE" --cfg none tx \
  --ethereum-rpc "$ETHEREUM_RPC" \
  --ethereum-router "$ROUTER" \
  --sender "$SENDER" \
  create "$CODE_ID" \
  --json
```

Capture `actor_id` as `PROGRAM_ID`.

## 4. Top Up Executable Balance

Injected messages still spend the program executable balance. Top it up before init or user messages.

wVARA uses 12 decimals.

```bash
"$ETHEXE" --cfg none tx \
  --ethereum-rpc "$ETHEREUM_RPC" \
  --ethereum-router "$ROUTER" \
  --sender "$SENDER" \
  executable-balance-top-up "$PROGRAM_ID" "10000 WVARA" \
  --approve \
  --watch \
  --json
```

Wait for the mirror state change, not only the Ethereum receipt.

## 5. Initialize

Encode the Sails constructor payload from the IDL or generated client. Do not guess constructor bytes.

```bash
"$ETHEXE" --cfg none tx \
  --ethereum-rpc "$ETHEREUM_RPC" \
  --ethereum-router "$ROUTER" \
  --sender "$SENDER" \
  send-message "$PROGRAM_ID" "$INIT_PAYLOAD" 0 \
  --watch \
  --json
```

Expected success has reply code `0x00000000` for success auto reply or `0x00010000` for success manual reply.

## 6. Seed State With Injected Transactions

Use injected transactions for operational setup messages that do not carry ETH value and should enter Vara.eth directly.

```bash
"$ETHEXE" --cfg none tx \
  --ethereum-rpc "$ETHEREUM_RPC" \
  --ethereum-router "$ROUTER" \
  --sender "$SENDER" \
  send-message "$PROGRAM_ID" "$PAYLOAD" 0 \
  --rpc-url "$VARA_ETH_RPC" \
  --injected \
  --watch \
  --json
```

The CLI rejects injected messages with non-zero ETH value. Use normal `send-message` or an ABI/Solidity path when value transfer is required.

For large setup payloads, send them sequentially and verify each reply before the next one.

## 7. Smoke-Read State

Use a program-specific query after init and setup. A generic state query proves the mirror exists and shows balances; a Sails query proves the app is logically ready.

Generic mirror state:

```bash
"$ETHEXE" --cfg none tx \
  --ethereum-rpc "$ETHEREUM_RPC" \
  --ethereum-router "$ROUTER" \
  --sender "$SENDER" \
  query "$PROGRAM_ID" \
  --rpc-url "$VARA_ETH_RPC" \
  --json
```

Program-specific state should use `calculateReplyForHandle(...)`, a generated client, or a CLI/script that encodes the query payload from the IDL.

## 8. Browser Frontend Flow

In a browser app:

1. Read config from Vite or the app's env system:
   - Ethereum RPC
   - Vara.eth RPC
   - Router address
   - Program ID
2. Request accounts through the injected wallet:

```ts
const [address] = await window.ethereum.request({ method: "eth_requestAccounts" });
```

3. Create `publicClient` from Ethereum RPC and `walletClient` from `custom(window.ethereum)`.
4. Convert the wallet client to a Vara.eth signer.
5. Create `VaraEthApi` with `WsVaraEthProvider(VARA_ETH_RPC)`.
6. Encode the Sails write payload.
7. Send the injected transaction:

```ts
const tx = await api.createInjectedTransaction({
  destination: programId,
  payload,
  value: 0n,
});

const promise = await tx.sendAndWaitForPromise();
await promise.validateSignature();

if (promise.code.isError) {
  throw new Error(`Injected transaction failed with ${promise.code.reason}`);
}
```

8. Read the result through Vara.eth state:

```ts
const reply = await api.call.program.calculateReplyForHandle(
  address,
  programId,
  queryPayload,
  0n,
);
```

MetaMask is used here as an EIP-1193 signer. It does not mean the app submits a normal Ethereum transaction for the user action.

## 9. Timing And Cost Measurement

Measure these separately:

- injected promise latency: around `sendAndWaitForPromise()`
- state read latency: around `calculateReplyForHandle(...)`
- executable balance cost: `executable_balance_before - executable_balance_after`

For cost measurement, do not read the balance immediately after the injected promise and assume it is final. Poll mirror state until the `state_hash` changes or the executable balance changes, then compute the delta.

## Failure Modes

- Wrong Router address: upload, validation, and create can all succeed on the wrong Router but the frontend will attach to the wrong network state.
- Stale `CODE_ID`: if the user asked for fresh code, ignore old code ids and upload the current `.opt.wasm`.
- Missing executable balance: init or injected messages may not execute.
- Constructor payload guessed by hand: init may fail or initialize the wrong path.
- Old IDL parser mixed with a newer or older Sails IDL format.
- Treating MetaMask connection as an Ethereum transaction path.
- Reading state too soon after a promise when measuring costs.
- Not surfacing separate states for wallet connect, signing, injected promise, state read, and confirmed result.

## Finish Criteria

An injected app is ready when:

- Code was uploaded and validation approved on the intended Router.
- Program was created from the intended `code_id`.
- Executable balance is positive and sufficient for expected messages.
- Init returned a success reply.
- Required setup payloads returned success replies.
- A program-specific smoke read confirms readiness.
- The frontend sends injected writes, waits for promises, and reads state.
- TypeScript checks and relevant build commands pass.

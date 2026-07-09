# Vara.eth Integration Error Log

Use this reference as a source for future skills and troubleshooting checklists. Keep entries factual and reusable: record the symptom, root cause, fix, and prevention check. Avoid private keys, personal addresses, local absolute paths, and one-off machine details.

## Frontend Configuration

### Missing Vite env crashes React app

Symptom:

```text
Uncaught Error: Missing VITE_ETHEREUM_RPC
```

Context:

- A React component called a `getConfig()` function during render.
- The function threw immediately when a required Vite env variable was absent.

Cause:

- Required frontend config was treated as a hard invariant during render.

Fix:

- Add `readConfig()` that returns `{ missing: string[] }`.
- Render a missing-config state instead of throwing during component render.
- Keep `.env.example` with every required `VITE_...` variable.

Prevention:

- Do not call throwing config loaders directly from React render.
- Prefer visible UI state for missing RPC, Router, Program ID, or adapter address.

## Injected Frontend

### MetaMask opens from Submit instead of explicit Connect

Symptom:

- A browser wallet connection prompt appears when pressing `Submit`, even if the user did not press `Connect`.

Context:

- The digit-recognition injected frontend had this pattern:

```ts
const activeSession = session ?? (await connectVaraEth());
```

Cause:

- The submit handler implicitly requested accounts when no session existed.

Fix:

- Require explicit wallet connection before submit.
- Disable submit until `session` exists, or show a connect-first error.

Prevention:

- Keep wallet connection and write submission as separate UI states.

## ABI Adapter Frontend

### Custom Solidity error is not decoded

Symptom:

```text
The contract function "createOrder" reverted with the following signature: 0xbab7ca35
Unable to decode signature "0xbab7ca35" as it was not found on the provided ABI.
```

Context:

- `createOrder(seller)` was called with `seller == msg.sender`.
- The Solidity adapter reverted with `InvalidSeller()`.

Cause:

- The frontend ABI included functions and events but omitted custom errors.
- `0xbab7ca35` is the selector for `InvalidSeller()`.

Fix:

- Include adapter custom errors in the ABI passed to viem:

```ts
"error InvalidSeller()",
"error ZeroValue()",
"error ValueTooLarge()",
```

- Add client-side validation before `simulateContract(...)`:
  - seller is a valid Ethereum address,
  - seller is not the connected buyer account,
  - value is greater than zero.

Prevention:

- Add all custom errors to frontend ABI fragments.
- Mirror key Solidity role rules in frontend validation, but still keep Solidity checks authoritative.

### viem writeContract has no chain

Symptom:

```text
No chain was provided to the request.
Please provide a chain with the `chain` argument on the Action, or by supplying a `chain` to WalletClient.
```

Context:

- `createWalletClient({ account, transport: custom(window.ethereum) })` was used without a `chain`.
- `writeContract(...)` was then called for the deployed adapter.

Cause:

- viem needs a chain on the wallet client or action to format/send the write request.

Fix:

- Define the target chain and pass it to both clients:

```ts
const chain = defineChain({
  id: 560048,
  name: "Hoodi",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ethereumRpc] } },
});

const publicClient = createPublicClient({ chain, transport: http(ethereumRpc) });
const walletClient = createWalletClient({
  account,
  chain,
  transport: custom(window.ethereum),
});
```

- Switch or add the chain in MetaMask with `wallet_switchEthereumChain` and `wallet_addEthereumChain`.

Prevention:

- For every wallet frontend, configure chain before the first write.
- Verify wallet chain id and public RPC chain id match.

### Seller equal to buyer is rejected

Symptom:

- `createOrder(seller)` reverts when the seller is the connected account.

Cause:

- The escrow adapter models two-party escrow:

```text
buyer pays -> seller receives after release
```

- `seller == msg.sender` is intentionally rejected as `InvalidSeller()`.

Fix:

- Use a different seller account.
- If self-lock behavior is desired, design a different contract model with `depositor`, `beneficiary`, and `unlock condition` instead of buyer/seller escrow.

Prevention:

- UI copy and validation should explain the buyer/seller role split.

### Browser query path fails with Buffer is not defined

Symptom:

```text
Vara.eth query failed: Buffer is not defined
```

Context:

- A browser frontend used `SailsIdlParser` at runtime to encode a read-only query payload.
- The query was `calculateReplyForHandle(...)` for a known Sails query.

Cause:

- The current `sails-js` parser initialization path calls Node `Buffer`.
- Vite does not provide Node globals in browser runtime by default.

Fix:

- Do not parse IDL in the browser for a fixed query when the generated payload shape is already known.
- Move IDL parsing/code generation to build time, or use a small query-specific encoder/decoder in the frontend interaction layer.
- Keep the UI calling a typed helper, not hand-building payloads inline.

Prevention:

- Browser frontend checks should include a runtime smoke path, not only TypeScript build.
- Watch Vite warnings about Node compatibility and avoid importing Node-only IDL parser paths into user-facing bundles.

### Unit-return ABI callback selector mismatch

Symptom:

- Vara.eth state shows a final status such as `Released`.
- Solidity adapter state still has `closed = false` and `claimable[...] = 0`.
- The Mirror emits `ReplyCallFailed` for the original message with success reply code `0x00010000`.

Context:

- A Solidity adapter called an ABI-enabled Vara.eth method with `callReply = true`.
- The Sails method returned `Result<(), String>`.
- The generated Solidity callback stub used `replyOn_ordersReleaseOrder(bytes32)`.

Cause:

- The observed success reply payload used selector `replyOn_ordersReleaseOrder(bytes32,())`.
- A Solidity contract that only implements `replyOn_ordersReleaseOrder(bytes32)` does not match that selector, so the Mirror low-level callback call fails.

Fix:

- For unit-return methods, add a restricted fallback that accepts the `bytes32,()` callback selector and dispatches to the same internal completion logic.
- Keep the normal generated callback stub too, so the adapter remains compatible if generated output changes.
- Prevent duplicate finalizing actions while a release, refund, or cancel is waiting for a callback.

Prevention:

- Decode `performStateTransition` inputs or Mirror `ReplyCallFailed` events when callback state is missing.
- Compare the actual success reply payload selector with the generated Solidity callback selector.
- Include unit-return methods in ABI adapter smoke tests, not only methods that return values.

## Deploy And Network Flow

### ethexe upload --watch fails on HTTP RPC

Symptom:

```text
Waiting for approval of code (`--watch` option was passed)...
Error: failed to wait for code validation
Caused by:
    subscriptions are not available on this provider
```

Context:

- `ethexe tx upload ... --watch --json` was run with an HTTP Ethereum RPC endpoint.
- The upload transaction succeeded and returned a tx hash, but validation watching failed.

Cause:

- `--watch` subscribes to Router events and requires subscription support.
- Some HTTP RPC endpoints do not support subscriptions.

Fix:

- Keep the returned `code_id`.
- Check validation separately with Router `codeState(bytes32)`:

```bash
cast call "$ROUTER" "codeState(bytes32)(uint8)" "$CODE_ID" --rpc-url "$ETHEREUM_RPC"
```

- `2` means `Validated`.
- Then proceed with `create` or `create-with-abi`.

Prevention:

- If using HTTP RPC, document the fallback validation check.
- If using `--watch`, prefer a provider that supports subscriptions.

### WebSocket Ethereum RPC forbidden

Symptom:

```text
Internal transport error: HTTP error: 403 Forbidden with wss://...
```

Cause:

- The tested Ethereum endpoint did not accept WebSocket transport at that URL.

Fix:

- Use HTTP RPC plus explicit `codeState(...)` polling.
- Do not assume every HTTP RPC has an equivalent `wss://` endpoint.

Prevention:

- Verify Ethereum HTTP and WS endpoints separately.

### DNS/network blocked in sandbox

Symptoms:

```text
npm error network request to https://registry.npmjs.org/... failed
reason: getaddrinfo ENOTFOUND registry.npmjs.org
```

```text
Error #1: dns error
failed to lookup address information
```

Cause:

- Network access was restricted by the execution environment, not by the app.

Fix:

- Re-run the same command with explicit network approval when dependency install or live RPC access is required.

Prevention:

- Distinguish app failures from sandbox/network policy failures in final reports.

## Local Dev Tooling

### Vite cannot listen inside sandbox

Symptom:

```text
Error: listen EPERM: operation not permitted 127.0.0.1:<port>
```

Cause:

- The execution environment blocked opening a local listening socket.

Fix:

- Re-run the dev server command with approval for local server access.

Prevention:

- For frontend work, expect dev server startup to need elevated permission in sandboxed sessions.

### curl cannot reach local server without matching permission

Symptom:

```text
curl: (7) Failed to connect to 127.0.0.1 port <port>
```

Context:

- The dev server was running in an approved context.
- A later local `curl` check from the sandbox failed.

Cause:

- The check command lacked matching permission to reach the local socket.

Fix:

- Re-run the local `curl` check with approval or with an already approved command prefix.

Prevention:

- Treat local server verification as part of the same permission class as server startup.

### Foundry signature cache write warning

Symptom:

```text
WARN evm::traces: failed to flush signature cache
failed to create file ".../.foundry/cache/signatures": Operation not permitted
```

Cause:

- Foundry tried to write a cache file outside the workspace.

Fix:

- Usually no code fix is needed if compile/deploy succeeded.
- Run with appropriate permission if cache writes are required.

Prevention:

- Do not confuse this warning with Solidity compilation failure.

### Foundry wallet list cannot create keystore directory

Symptom:

```text
Error: failed to create dir ".../.foundry/keystores": Operation not permitted
```

Cause:

- Foundry tried to create/read its keystore outside the workspace.

Fix:

- Run with appropriate permission, or use another signer flow.

Prevention:

- Check whether Foundry keystore is actually needed; `ethexe` keyring may already contain the sender for Router operations.

## TypeScript And Build

### String.replaceAll unavailable under ES2020 target

Symptom:

```text
Property 'replaceAll' does not exist on type 'string'.
Try changing the 'lib' compiler option to 'es2021' or later.
```

Cause:

- The frontend TypeScript config targeted `ES2020`.

Fix:

- Use a regex replace instead:

```ts
value.replace(/\s+/g, "-")
```

- Or explicitly move the TS lib target to ES2021 if the project wants that.

Prevention:

- Match helper methods to the configured TS target.

### viem simulateContract request type is too narrow for helper wrapper

Symptom:

```text
Argument of type ... is not assignable to parameter of type WriteContractParameters...
Types of property 'value' are incompatible.
```

Context:

- A generic helper accepted `Parameters<typeof walletClient.writeContract>[0]`.
- It was passed `request` from `publicClient.simulateContract(...)`.

Cause:

- viem's inferred union for payable and nonpayable calls can be narrower than a generic helper signature.

Fix:

- Keep the helper boundary typed as `unknown` and cast at the call site to the wallet client's parameter type.
- Alternatively, avoid the wrapper and call `walletClient.writeContract(request)` inline per action.

Prevention:

- Be careful when abstracting viem request objects across payable and nonpayable functions.

### Claim button stays disabled after switching MetaMask account

Symptom:

- `release` succeeds.
- The adapter emits `OrderReleased`.
- `claimable[seller]` is greater than zero on-chain.
- The frontend still shows `Claimable = 0` or keeps `Claim` disabled after switching from buyer to seller in MetaMask.

Context:

- The escrow adapter credits `claimable[order.seller]` only after the trusted Vara.eth success callback.
- The frontend reads `claimable(session.account)`.

Cause:

- The browser wallet account changed, but the app kept the old in-memory session and wallet client account.
- Reads were still performed for the buyer account, where `claimable` is zero.

Fix:

- Subscribe to wallet `accountsChanged` and `chainChanged`.
- Recreate the app session and reread adapter/Vara.eth state after wallet changes.
- Also allow a manual reconnect path so users can force-refresh the selected wallet account.

Prevention:

- Any frontend that stores a wallet client or account in state should handle account and chain changes explicitly.
- When debugging claim availability, compare `claimable[buyer]` and `claimable[seller]` directly on the adapter.

## Security And Dependency Checks

### npm audit reports Vite/esbuild moderate advisory

Symptom:

```text
2 moderate severity vulnerabilities
esbuild enables any website to send any requests to the development server and read the response
fix available via `npm audit fix --force`
Will install vite@6.x, which is a breaking change
```

Cause:

- The Vite 5 dependency tree includes an esbuild dev-server advisory.

Fix:

- For a demo frontend, record the advisory and avoid force-upgrading unless the repo chooses a Vite major upgrade.

Prevention:

- Run `npm audit` after dependency install.
- Note whether findings affect dev server only or production bundle/runtime.

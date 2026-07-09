# Vara.eth TypeScript `@vara-eth/api` Workflow

Use this playbook when you want to script funding, initialization, state reads, or interaction through TypeScript instead of driving the flow manually through `ethexe` CLI.

The default `SailsProgram + mirror.sendMessage(...)` path in this playbook does not use a Solidity ABI interface. Use `playbooks/vara-eth-abi-interface.md` and the `createProgramWithAbiInterface(...)` section below only when Ethereum ABI-facing interaction is required.

## Core Rule

Use `@vara-eth/api` for Router, Mirror, wVARA, Vara.eth-side queries, and transaction helpers. Keep upload and code validation CLI-first unless the exact `@vara-eth/api` version you are using explicitly exposes the upload helpers you need.

For Sails contracts, do not hand-encode message payloads. Parse the Sails IDL and generate payloads through `sails-js`.

## What You Need

- `@vara-eth/api`
- `viem`
- `kzg-wasm`
- `@gear-js/api`, `@polkadot/api`, and `@polkadot/util` versions compatible with the Sails JS package
- `sails-js` from the IDL v2 GitHub release
- a signer compatible with `@vara-eth/api`
- Router address
- Ethereum RPC URL
- Vara.eth WS RPC URL
- an existing program id, or a validated `codeId` if the script will create the program
- Sails IDL generated from the contract

Use the Sails JS release tarball when the script needs IDL v2 support:

```json
{
  "dependencies": {
    "@gear-js/api": "^0.45.0",
    "@polkadot/api": "^16.5.6",
    "@polkadot/util": "^14.0.3",
    "@vara-eth/api": "latest",
    "kzg-wasm": "1.0.0",
    "sails-js": "https://github.com/gear-tech/sails/releases/download/js/v1.0.0-beta.1/sails-js.tgz",
    "viem": "^2.39.0"
  }
}
```

Do not add a separate `sails-js-parser` dependency for IDL v2. Import the parser from `sails-js/parser`.

Run TypeScript snippets from the package directory where these dependencies are installed. This matters for `sails-js/parser`: if the command is launched from a parent directory with another `node_modules`, Node can resolve the wrong `sails-js` package.

## 1. Initialize Clients

Use `createVaraEthApi(...)` as the primary constructor. It initializes the Ethereum client internally; access it through `api.eth` when needed.

```ts
import { readFile } from "node:fs/promises";
import { WsVaraEthProvider, createVaraEthApi, getMirrorClient } from "@vara-eth/api";
import { walletClientToSigner } from "@vara-eth/api/signer";
import { SailsProgram } from "sails-js";
import { SailsIdlParser } from "sails-js/parser";
import { createPublicClient, createWalletClient, http, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

type Hex = `0x${string}`;

function asHex(payload: string | Uint8Array): Hex {
  return (typeof payload === "string" ? payload : toHex(payload)) as Hex;
}

const routerAddress = "0x..." as Hex;
const programId = "0x..." as Hex;
const ethRpc = "https://...";
const varaEthWs = "wss://...";

const account = privateKeyToAccount("0x...");
const publicClient = createPublicClient({ transport: http(ethRpc) });
const walletClient = createWalletClient({ account, transport: http(ethRpc) });
const signer = walletClientToSigner(walletClient);

const api = await createVaraEthApi(
  new WsVaraEthProvider(varaEthWs),
  publicClient,
  routerAddress,
  signer,
);

const mirror = getMirrorClient({
  address: programId,
  publicClient,
  signer,
});
```

## 2. Parse Sails IDL And Build Payloads

Generate an IDL with a parser-friendly program name when needed:

```bash
cargo sails idl --program-name MyProgram
```

Then parse the IDL with `SailsProgram`:

```ts
const parser = new SailsIdlParser();
await parser.init();

const idl = await readFile(new URL("../target/my-program.idl", import.meta.url), "utf8");
const doc = parser.parse(idl);

const program = new SailsProgram(doc);
program.setProgramId(programId);
```

In this `@vara-eth/api` workflow, `SailsProgram` is used for IDL parsing plus payload/result encoding and decoding. Do not pass the `@vara-eth/api` object to `program.setApi(...)`; `setApi` expects a `GearApi` instance and is only needed if you use SailsProgram's own `@gear-js/api`-backed calls.

For payloads, use the IDL methods directly:

```ts
const depositPayload = asHex(program.services.Vault.functions.Deposit.encodePayload());
const totalBalancePayload = asHex(program.services.Vault.queries.TotalBalance.encodePayload());
```

Typical rules:

- use `program.ctors.<Constructor>.encodePayload(...)` for first-message initialization
- use `program.services.<Service>.functions.<Method>.encodePayload(...)` for write messages
- use `program.services.<Service>.queries.<Method>.encodePayload(...)` for read-only query simulation
- decode replies with the matching function or query object that produced the payload

## 3. Upload And Validation

Treat upload as CLI-first:

```bash
ethexe tx \
  --ethereum-rpc "$RPC" \
  --ethereum-router "$ROUTER" \
  --sender "$SENDER" \
  upload target/wasm32-gear/release/my_program.opt.wasm \
  --watch
```

Then carry the validated `codeId` into the TypeScript flow.

Use TypeScript upload only if your exact `@vara-eth/api` version explicitly exposes and documents the helpers you need for blob upload and validation tracking.

## 4. Create The Program

Use a validated `codeId` from the upload/validation step. Optional `overrideInitializer` and `salt` arguments are available when the flow needs deterministic creation or an initializer different from the signer.

```ts
const codeId = "0x...";

const tx = await api.eth.router.createProgram(codeId);
await tx.sendAndWaitForReceipt();

const programId = await tx.getProgramId();
```

With ABI:

```ts
const abiInterfaceAddress = "0x...";
const initializer = await signer.getAddress();
const salt = "0x0000000000000000000000000000000000000000000000000000000000000000";

const tx = await api.eth.router.createProgramWithAbiInterface(
  codeId,
  abiInterfaceAddress,
  initializer,
  salt,
);

const receipt = await tx.sendAndWaitForReceipt();
const programId = await tx.getProgramId();

console.log(receipt.transactionHash, programId);
```

This requires a deployed ABI interface contract address. Generating Solidity from Sails IDL is not enough by itself; deploy the generated ABI interface contract first.

## 5. Top Up Executable Balance

`wVARA` uses `12` decimals: `1 wVARA = 1000000000000` base units.

Example: top up `1 wVARA`.

```ts
const amount = 1_000_000_000_000n;

const approveTx = await api.eth.wvara.approve(programId, amount);
await approveTx.sendAndWaitForReceipt();

const topUpTx = await mirror.executableBalanceTopUp(amount);
await topUpTx.sendAndWaitForReceipt();
```

## 6. Initialize The Program

The first message initializes the program. Only the initializer may send it.

```ts
const createCtor = program.ctors?.Create;
if (!createCtor) throw new Error("Create constructor is missing in IDL");

const initPayload = asHex(createCtor.encodePayload());
const initTx = await mirror.sendMessage(initPayload, 0n);
await initTx.send();

const { waitForReply } = await initTx.setupReplyListener();
const initReply = await waitForReply();
```

Do not run the init branch again after a program is already initialized.

## 7. Send Regular Messages

```ts
const payload = asHex(program.services.Vault.functions.Deposit.encodePayload());

const tx = await mirror.sendMessage(payload, 1_000_000_000_000_000n);
await tx.send();

const { waitForReply } = await tx.setupReplyListener();
const reply = await waitForReply();

const newBalance = program.services.Vault.functions.Deposit.decodeResult(reply.payload);
```

For payable methods, pass ETH value as the second `mirror.sendMessage(payload, value)` argument. This is program value, not wVARA executable balance.

## 8. Decode Reply Codes

Log reply codes with a short human-readable meaning. At minimum, handle these common success codes:

```ts
function describeReplyCode(replyCode: string): string {
  const knownCodes: Record<string, string> = {
    "0x00000000": "success, auto reply",
    "0x00010000": "success, manual reply",
  };

  const normalized = replyCode.toLowerCase();
  return `${replyCode} (${knownCodes[normalized] ?? "unknown reply code"})`;
}
```

Observed examples:

- `0x00000000` = success, auto reply
- `0x00010000` = success, manual reply

For contract methods that explicitly return a value, expect the manual success reply code.

## 9. Read Query Replies

Use `calculateReplyForHandle(...)` for read-only calls and decode with the matching query object:

```ts
const source = await signer.getAddress();
const payload = asHex(program.services.Vault.queries.TotalBalance.encodePayload());

const reply = await api.call.program.calculateReplyForHandle(
  source,
  programId,
  payload,
);

const totalBalance = program.services.Vault.queries.TotalBalance.decodeResult(reply.payload);
```

This avoids sending an Ethereum transaction for query-like reads.

## 10. Optional Fast Path: Injected Transactions

When the task is pre-confirmation or fast UX instead of standard L1 settlement, use injected transactions:

```ts
const injected = await api.createInjectedTransaction({
  destination: programId,
  payload,
  value: 0n,
});

const promise = await injected.sendAndWaitForPromise();
await promise.validateSignature();
```

Use this path only when the product flow actually wants Vara.eth-side submission semantics.

## Common Failure Modes

- installing `sails-js` from npm `latest` when the script needs the IDL v2 parser from the GitHub release tarball
- importing `SailsIdlParser` from the old `sails-js-parser` package instead of `sails-js/parser`
- forgetting to align the Sails JS peer dependencies, especially `@gear-js/api`
- generating IDL with a program name such as `Vault.opt`; use `cargo sails idl --program-name Vault` when parser or Solidity generation rejects it
- creating a program before code validation has completed
- forgetting that `wVARA` uses `12` decimals
- sending the first message from an address different from the initializer
- hand-encoding Sails payloads instead of generating them from IDL
- forgetting to call `await waitForReply()` after `setupReplyListener()`
- treating `0x00010000` as a failure even though it is a success manual reply
- reading only `stateHash()` and forgetting to fetch the actual state body through `api.query.program.readState(...)`, when the task requires raw state rather than a Sails query result
- assuming an ABI transaction receipt means the Vara.eth state is already visible through read-only queries; add a short wait or poll state reads when checking post-transaction state

## ABI Example

The `vault:create-with-abi` script demonstrates the ABI-enabled creation step. Before running it, generate and deploy the Solidity ABI interface contract.

```bash
PRIVATE_KEY=0x... \
ROUTER=0x... \
CODE_ID=0x... \
ABI_INTERFACE_ADDRESS=0x... \
npm run vault:create-with-abi
```

Required inputs:

- `CODE_ID`: validated Sails WASM code id
- `ABI_INTERFACE_ADDRESS`: deployed generated Solidity ABI interface contract
- `INITIALIZER`: optional override initializer; defaults to the signer address
- `SALT`: optional deterministic creation salt; defaults to zero salt

Concrete snippet file:

- `examples/vault/ts/vault_create_with_abi.ts`

The `vault:abi-interact` script demonstrates ABI-facing calls against an ABI-enabled mirror:

```bash
PRIVATE_KEY=0x... \
ROUTER=0x... \
PROGRAM_ID=0x... \
npm run vault:abi-interact
```

It calls `vaultDeposit(false)` through the generated Solidity ABI shape and then reads `totalBalance` and `balanceOf` through read-only Sails queries.

Concrete snippet files:

- `examples/vault/ts/vault_abi_interact.ts`
- `examples/vault/ts/vault_read_state.ts`

Operational notes from the live `vault` run:

- deploy the generated ABI interface contract first, for example with `forge create --broadcast ... Vault.sol:VaultAbi`
- `createProgramWithAbiInterface(...)` creates a new mirror/program tied to that ABI interface
- the ABI-enabled mirror still needs executable balance top-up before the first message
- initialization can be sent through the ABI method `create(false)`
- regular calls can be sent through ABI methods such as `vaultDeposit(false)`
- an Ethereum transaction receipt confirms the L1 transaction; Vara.eth state may update shortly after, so repeat read-only state checks or wait for state processing before asserting final balances

## Vault Walkthrough

The non-ABI `vault` example is a good minimal reference for direct Sails payload interaction:

- create the program from a validated `codeId`
- approve and top up `1 wVARA` as `1000000000000n`
- initialize the program by sending the first `Create()` message from the same address that created it
- parse the Sails IDL through `SailsProgram`
- use generated Sails payloads for `deposit`, `withdraw`, `pause`, `unpause`, `balance_of`, and `total_balance`
- decode reply codes before reporting success or failure
- do not call this an ABI flow; it does not require `createProgramWithAbiInterface(...)`

After initialization:

- `deposit` sends ETH value through `mirror.sendMessage(...)`
- `balance_of` and `total_balance` can be checked through `api.call.program.calculateReplyForHandle(...)`
- admin methods such as `pause` and `unpause` should be sent from the admin address established at initialization

Keep the `vault` example focused on the same two balances we verified live:

- ETH passed to payable messages is program value
- `wVARA` executable balance pays for execution and decreases after init and message processing

Concrete snippet files:

- `examples/vault/ts/vault_vara_eth_api.ts`
- `examples/vault/ts/vault_admin_flow.ts`
- `examples/vault/ts/vault_read_state.ts`

## Pairing

Use this playbook together with:

- `skills/vara-eth-contract-writer/SKILL.md` for contract authoring
- `skills/vara-eth-app-builder/SKILL.md` for deploy and integration work
- `playbooks/vara-eth-ethexe-cli-workflow.md` when you need the CLI equivalent of the same lifecycle
- `playbooks/vara-eth-abi-interface.md` when the program must be created with ABI support

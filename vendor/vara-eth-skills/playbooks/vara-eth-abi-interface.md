# Vara.eth ABI Interface Workflow

Use this playbook when the contract is written in Rust with Sails, but it must be created or interacted with through a Solidity ABI interface.

## Core Rule

This is still Rust contract work, not writing a new Solidity contract. The Solidity side is a generated interface layer that makes Vara.eth mirrors usable from Etherscan, ethers.js, Foundry, Hardhat, or other Solidity-facing tooling.

Use this workflow only when ABI-facing interaction is actually needed. If the contract will be used only through Rust or TypeScript clients that already speak the expected payload format, ABI generation may be unnecessary.

## When To Use It

Use this workflow when you need one or more of these outcomes:

- typed Ethereum-style interaction with the mirror contract
- Etherscan "Write as Proxy" or "Read as Proxy" support
- ethers.js integration via a normal ABI
- another Solidity contract calling the Vara.eth program through a typed interface

## Inputs And Preconditions

Before starting, make sure you have:

- a compiled Sails contract for Vara.eth
- a generated `.idl` file
- public methods whose types are compatible with the current `ethexe` ABI path
- the `ethexe` binary available locally for upload, validation, and create flows. It can be built after `git clone https://github.com/gear-tech/gear.git` or downloaded from `https://get.gear.rs/#vara-eth`
- an Ethereum environment where the generated ABI interface contract can be deployed

Typical build step:

```bash
cargo build --release
```

Typical IDL location:

```text
target/wasm32-gear/release/<program>.idl
```

## Workflow

### 1. Generate IDL

Generate or refresh the IDL from the program crate:

```bash
cargo sails idl --manifest-path ./Cargo.toml
```

If needed, set an explicit program name:

```bash
cargo sails idl --manifest-path ./Cargo.toml --program-name MyProgram
```

### 2. Generate Solidity Interface From IDL

Generate the Solidity ABI contract from the IDL:

```bash
cargo sails sol --idl-path ./target/wasm32-gear/release/my_program.idl
```

This produces a Solidity contract or interface that mirrors the exposed Sails services and methods.

Use this step early when ABI-facing integration matters, because it is one of the fastest ways to catch public type or signature incompatibilities.

### 3. Deploy The Generated ABI Contract

Deploy the generated Solidity artifact to Ethereum using your normal tooling, such as Foundry, Hardhat, or another deployment flow.

Foundry example:

```bash
forge create \
  --broadcast \
  --root . \
  --contracts . \
  --rpc-url "$ETH_RPC" \
  --private-key "$PRIVATE_KEY" \
  Vault.sol:VaultAbi
```

The deployed ABI contract address is then used when creating the Vara.eth mirror with ABI enabled. The upload and code-validation part is still the same as the plain `ethexe tx create` flow: upload the `.opt.wasm`, wait for validation approval, capture the `code_id`, and only then call `create-with-abi`.

### 4. Create The Program With ABI Enabled

Create the program with the ABI interface attached.

CLI flow:

Before this step, make sure the sender key is imported with `ethexe key keyring import --private-key ...`, and keep the transaction-level flags on `ethexe tx` before the subcommand.

```bash
ethexe tx \
  --ethereum-rpc "$RPC" \
  --ethereum-router "$ROUTER" \
  --sender "$SENDER" \
  create-with-abi "$CODE_ID" "$ABI_INTERFACE_ADDRESS" \
  --salt 0x0000000000000000000000000000000000000000000000000000000000000000 \
  --initializer "$SENDER"
```

TypeScript-style flow:

```ts
const tx = await api.eth.router.createProgramWithAbiInterface(
  codeId,
  abiInterfaceAddress,
  initializer,
  salt,
);

const receipt = await tx.sendAndWaitForReceipt();
const programId = await tx.getProgramId();
```

Concrete TypeScript example:

- `examples/vault/ts/vault_create_with_abi.ts`

Implementation note from `ethexe` router logic: the ABI-aware creation path ultimately uses `(code_id, salt, override_initializer, abi_interface)`.

### 5. Fund And Initialize The ABI-Enabled Mirror

The ABI-enabled mirror still needs executable balance before the first message. `wVARA` has 12 decimals, so `1000000000000` is `1 wVARA`:

```bash
ethexe tx \
  --ethereum-rpc "$RPC" \
  --ethereum-router "$ROUTER" \
  --sender "$SENDER" \
  executable-balance-top-up \
  --approve \
  --watch \
  "$PROGRAM_ID" \
  1000000000000
```

Then initialize the program through the generated ABI method. For the vault example, the init call is:

```bash
cast send "$PROGRAM_ID" "create(bool)" false \
  --rpc-url "$ETH_RPC" \
  --private-key "$PRIVATE_KEY"
```

For another contract, replace the method signature and arguments with the generated constructor/init ABI shape. Verify initialization with `ethexe tx query`: a successful first message should move `nonce` to `1`.

### 6. Interact Through ABI-Aware Tooling

Once deployed with ABI enabled, the mirror can be used like a normal Ethereum contract.

With ethers.js:

```ts
import { ethers } from "ethers";
import abi from "./MyProgramAbi.json";

const mirror = new ethers.Contract(programId, abi, signer);
const tx = await mirror.myMethod(arg1, arg2);
await tx.wait();
```

With Foundry `cast`, using the vault ABI method as an example:

```bash
cast send "$PROGRAM_ID" "vaultDeposit(bool)" false \
  --value 1000000000000000 \
  --rpc-url "$ETH_RPC" \
  --private-key "$PRIVATE_KEY"
```

For another contract, use the generated ABI method name and arguments for that contract.

An Ethereum receipt means the L1 transaction landed. When asserting Vara.eth state, read it after processing or poll read-only queries until the expected state is visible.

Through Etherscan:

- use "Write as Proxy" for mutating methods
- use "Read as Proxy" for read-only methods

## What ABI Changes

Without ABI enabled, callers usually need to match the program's expected encoding path directly.

With ABI enabled:

- the mirror accepts standard ABI-encoded payloads
- Ethereum-facing tooling can work with the program through the generated interface
- Etherscan becomes much more usable for manual inspection and testing

This is the main reason to prefer ABI-enabled creation when the contract is intended for Ethereum-style consumers.

## Common Pitfalls

- Generating Solidity artifacts too late, after the public API has already hardened around incompatible types.
- Confusing ABI interface generation with writing a new Solidity implementation.
- Creating the program without ABI and then expecting Etherscan proxy tabs or normal ethers.js ABI calls to work the same way.
- Assuming all public Rust types or integer widths work equally on the current `ethexe` Solidity path. Keep ABI-facing type notes in `skills/vara-eth-contract-writer/SKILL.md`.
- Forgetting to deploy the generated ABI contract before calling `create-with-abi`.
- Forgetting that ABI-enabled creation still depends on the same upload and validation approval path as plain `create`.
- Forgetting that ABI-enabled mirrors still need executable balance before init and message processing.
- Assuming the Ethereum receipt immediately implies the updated Vara.eth state is visible; state reads may need a short wait or polling.
- Putting `--ethereum-rpc`, `--ethereum-router`, or `--sender` after `create-with-abi` instead of on `ethexe tx` itself.

If `cargo sails sol` fails while parsing an IDL whose program declaration looks like `program <Name>.opt { ... }`, regenerate the IDL with an explicit `cargo sails idl --program-name <NameWithoutDot>`.

## Pairing

Use this playbook together with:

- `skills/vara-eth-contract-writer/SKILL.md` for contract authoring
- `skills/vara-eth-app-builder/SKILL.md` for deploy and integration flows around an existing contract

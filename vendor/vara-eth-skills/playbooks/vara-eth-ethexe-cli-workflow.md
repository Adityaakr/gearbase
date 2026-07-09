# Vara.eth `ethexe` CLI Workflow

Use this playbook when the contract is already built and the next task is to deploy, fund, initialize, query, or interact with it through the `ethexe` CLI.

## What You Need

- the `ethexe` binary available locally
- Ethereum RPC URL
- Router address
- sender address with a corresponding private key
- built contract artifacts, especially `<program>.opt.wasm`
- a Vara.eth WS RPC URL for state queries

You can get `ethexe` in either of these ways:

```bash
git clone https://github.com/gear-tech/gear.git
```

Then build `ethexe` from the `gear` repository, or download it from:

```text
https://get.gear.rs/#vara-eth
```

## Core Rules

- Put `--ethereum-rpc`, `--ethereum-router`, and `--sender` on `ethexe tx` before the subcommand.
- Use `ethexe key keyring import --private-key ...` to import the sender key.
- Treat `upload --watch` as the validation gate. Do not call `create` before code validation succeeds and returns a `code_id`.
- `wVARA` uses `12` decimals. `1 wVARA = 1000000000000` base units.
- `send-message <payload> <value>` uses ETH value, not wVARA.
- `query` still uses the normal `ethexe tx` connection flags and additionally needs `--rpc-url` for the Vara.eth WS endpoint.

## Setup

Export the values you will reuse:

```bash
export ETHEXE="/path/to/ethexe"
export RPC="wss://..."
export ROUTER="0x..."
export SENDER="0x..."
export VARA_ETH_RPC="wss://..."
export WASM="./target/wasm32-gear/release/my_program.opt.wasm"
```

Import the sender key into the `ethexe` key store:

```bash
"$ETHEXE" key keyring import --private-key "$PRIVATE_KEY" --name my-sender
```

## 1. Upload And Validate Code

```bash
"$ETHEXE" tx \
  --ethereum-rpc "$RPC" \
  --ethereum-router "$ROUTER" \
  --sender "$SENDER" \
  upload "$WASM" \
  --watch \
  --json
```

Wait for:

- upload receipt on Ethereum
- validation approval
- returned `code_id`

Do not continue until validation is approved.

## 2. Create The Program

```bash
export CODE_ID="0x..."
export SALT="0x0000000000000000000000000000000000000000000000000000000000000001"

"$ETHEXE" tx \
  --ethereum-rpc "$RPC" \
  --ethereum-router "$ROUTER" \
  --sender "$SENDER" \
  create "$CODE_ID" \
  --salt "$SALT" \
  --json
```

Expected output includes:

- create transaction hash
- `actor_id` which is the Mirror address

```bash
export PROGRAM_ID="0x..."
```

## 3. Top Up Executable Balance

Programs need `wVARA` before they can execute messages.

Example: top up `1 wVARA`.

```bash
"$ETHEXE" tx \
  --ethereum-rpc "$RPC" \
  --ethereum-router "$ROUTER" \
  --sender "$SENDER" \
  executable-balance-top-up "$PROGRAM_ID" 1000000000000 \
  --approve \
  --watch \
  --json
```

Wait for both:

- Ethereum receipt
- mirror state change confirmation

## 4. Initialize The Program

If the program has a constructor-style first message, send it now.

```bash
"$ETHEXE" tx \
  --ethereum-rpc "$RPC" \
  --ethereum-router "$ROUTER" \
  --sender "$SENDER" \
  send-message "$PROGRAM_ID" "0x..." 0 \
  --watch \
  --json
```

Check:

- transaction receipt
- message id
- reply code, if `--watch` is used

For a zero-argument constructor, the payload must still be the correct encoded Sails call. Do not guess this payload. Generate it from the IDL or client code when possible.

## 5. Query Mirror State

```bash
"$ETHEXE" tx \
  --ethereum-rpc "$RPC" \
  --ethereum-router "$ROUTER" \
  --sender "$SENDER" \
  query \
  --rpc-url "$VARA_ETH_RPC" \
  "$PROGRAM_ID" \
  --json
```

Useful fields:

- `state_hash`
- `nonce`
- `exited`
- `initializer`
- `balance`
- `executable_balance`

## 6. Send Regular Messages

After initialization, interact with the program through `send-message`.

```bash
"$ETHEXE" tx \
  --ethereum-rpc "$RPC" \
  --ethereum-router "$ROUTER" \
  --sender "$SENDER" \
  send-message "$PROGRAM_ID" "0x..." 0 \
  --watch \
  --json
```

For payable methods, pass ETH value in the third positional argument.

## 7. Common Failure Modes

- `create` called before code validation approval
- executable balance is zero, so messages queue and do not execute
- wrong `wVARA` amount because `12` decimals were not respected
- `--ethereum-rpc`, `--ethereum-router`, or `--sender` placed after the subcommand
- constructor payload guessed by hand instead of generated from Sails IDL or client code
- `query` called without a Vara.eth WS RPC URL

## Pairing

Use this playbook together with:

- `skills/vara-eth-contract-writer/SKILL.md` for contract authoring
- `skills/vara-eth-app-builder/SKILL.md` for broader deploy and integration work
- `playbooks/vara-eth-abi-interface.md` when the program must be created with ABI support

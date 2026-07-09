---
name: vara-eth-contract-writer
description: Write and review Rust Sails contracts for Vara.eth. Use when an AI agent is asked to scaffold a new contract with `cargo sails new --eth`, implement or explain `Program` and `Service` structure, add events and exported methods, define payable methods, choose ABI-safe public types, or flag `ethexe` runtime limitations and forbidden patterns in contract design.
---

# Vara.eth Contract Writer

Use this skill when writing, changing, or reviewing a Rust contract for Vara.eth with Sails.

## Core Rule

Treat the target as Vara.eth, not generic Vara, generic Gear, or EVM Solidity. Use Sails with the `ethexe` feature and the Vara.eth artifact workflow.

Keep examples minimal, runnable, and explicit about generated artifacts. When contract behavior intersects with deployment, ABI, RPC, or runtime semantics, verify against `../../references/source-map.md`.

## Environment

Make sure the environment has:

- Rust toolchain.
- `wasm32v1-none`, installed with `rustup target add wasm32v1-none`.
- `sails-cli`, installed with `cargo install sails-cli`.

Scaffold new contracts with `--eth`:

```bash
AUTHOR="Gear Technologies"
USERNAME="gear-tech"

cargo sails new counter \
  --author "$AUTHOR" \
  --username "$USERNAME" \
  --eth

cd counter
```

Treat the generated project as the starting point. Add or revise services, events, and program state inside the generated Rust sources instead of inventing a parallel layout.

## Dependencies

Vara.eth contracts must use Sails with the `ethexe` feature enabled.

Typical dependency block:

```toml
[dependencies]
sails-rs = { version = "1.0.0-beta.2", features = ["ethexe"] }
parity-scale-codec = { version = "3", default-features = false }
scale-info = { version = "2", default-features = false }
```

Keep the `sails-rs` version compatible with the installed `sails-cli` and generated project. The examples in this repository use `sails-rs = "1.0.0-beta.2"`.

Use `parity-scale-codec` and `scale-info` when public custom types need encoding and type metadata.

## Contract Shape

A clear Sails contract usually has:

- `#![no_std]`.
- `use sails_rs::{cell::RefCell, prelude::*};`.
- A state/data struct that owns service state.
- An event enum marked with `#[event]`.
- One or more service structs that borrow shared state through `RefCell`.
- `#[service]` impl blocks with exported methods.
- A `#[program]` impl with `init` and exposed services.

For a small counter, exported methods can be `add(value: u32) -> u32`, `sub(value: u32) -> u32`, and `value() -> u32`, with events such as `Added(u32)` and `Subtracted(u32)`. Call out underflow or overflow risks when examples mutate integers.

## Services And State

Split services by responsibility, not by accident. A useful first split is user actions in one service and admin or config actions in another.

Good patterns:

- Keep shared contract data in one state struct.
- Pass `&RefCell<State>` into each service.
- Keep exported APIs narrow and domain-specific.
- Use helper guards such as `ensure_admin(...)` or `ensure_not_paused(...)` when several methods need the same check.
- Use explicit read methods instead of assuming callers can inspect internal state.
- Emit events for meaningful state transitions that clients need to observe.

Avoid global mutable state except in the smallest teaching examples.

## Errors And Results

Use `#[export(unwrap_result)]` for business errors that callers should see, for example:

- `insufficient deposited balance`
- `caller is not admin`
- `contract is paused`

Use direct panics or `expect(...)` only for internal failures that should be impossible in normal contract flow.

## Payable Methods

For Vara.eth contracts with the `ethexe` feature enabled, mark a constructor or exported method as payable only when it must receive positive value with the incoming message.

Use:

```rust
#[export(payable)]
```

or combine it with result unwrapping:

```rust
#[export(payable, unwrap_result)]
```

Important points:

- Do not mark a method payable unless positive incoming value is part of its public API.
- Do not assume exported methods are payable by default.
- If value is sent to a non-payable method or constructor in the `ethexe` path, execution will panic.
- Do not add a redundant `value == 0` guard inside a payable method; `#[export(payable)]` already means the method is called with `value > 0`.

## Public Types

Separate two concerns:

- IDL-friendly public types.
- Solidity-ABI-friendly public types.

For Sails IDL generation, public input and output types should be encodable, introspectable, and simple enough for generated clients.

For Solidity tooling, public types need an additional check: the ABI-facing surface must be compatible with the current `ethexe` Solidity generation path. Run `cargo sails sol --idl-path ...` early when Solidity integration is planned.

Known notes for the current path:

- `u8` does not work on the current `ethexe` Solidity path.
- `i8`, `Vec<u8>`, and `String` work on the current `ethexe` Solidity path.
- For event fields that identify accounts, choose a type that is verified by the current `ethexe` build and Solidity generation path. In the vault example, `[u8; 32]` compiled cleanly for account identifiers.
- If `cargo sails sol` fails on an IDL whose program declaration looks like `program <Name>.opt { ... }`, regenerate the IDL with `cargo sails idl --program-name <NameWithoutDot>`.

Treat these as common ABI friction points until verified:

- maps such as `HashMap` or `BTreeMap`
- deeply nested enums or tuples
- heavily generic public signatures
- internal program-specific types exposed directly in public methods

For Solidity-facing APIs, be explicit about `ActorId` versus Ethereum `address`:

- `ActorId` is 32 bytes.
- Ethereum `address` is 20 bytes.
- Conversions can require padding or explicit mapping rules.

## `ethexe` Runtime Restrictions

Design around `ethexe` runtime restrictions from the start.

Do not use:

- runtime randomness
- in-program creation of another program
- `msg_send_with_gas`, `msg_reply_with_gas`, or other `*_with_gas` helpers or wrappers
- gas reservation or unreservation flows
- reservation-based send or reply commit flows
- signal syscalls
- plain `wait`-based blocking behavior
- delayed wake flows

Flag patterns that imply these forbidden runtime syscalls:

- `random`
- `create_program`
- `reserve_gas`
- `unreserve_gas`
- `system_reserve_gas`
- `reply_deposit`
- `reservation_send_commit`
- `reservation_reply_commit`
- `signal_from`
- `signal_code`
- `gr_wait`

Favor explicit message-driven state machines, deterministic logic, and externally orchestrated workflows.

## Build And Test

Use:

```bash
cargo build --release
cargo test --release
```

Expected artifacts live under `target/wasm32-gear/release/`:

- `<program>.idl`
- `<program>.wasm`
- `<program>.opt.wasm`

Before saying a contract is ready, confirm the `.idl` and `.opt.wasm` files exist.

## References

Read `../../references/contract-writing-checklist.md` for the final contract review checklist.

Read `../../references/source-map.md` when a contract claim depends on deployment, ABI, RPC, CLI, or runtime implementation behavior.

# Vara.eth Contract Review Checklist

Use this checklist before treating a Rust Sails contract as ready for Vara.eth examples, deployment, or integration work.

## Project Setup

- The project was scaffolded with `cargo sails new <name> --eth`, or matches the same Vara.eth layout.
- `sails-rs` is configured with `features = ["ethexe"]`.
- The contract is clearly framed as Vara.eth-specific, not generic Vara or generic Gear.
- Custom public types derive or implement the encoding and type metadata needed by Sails.

## Contract Shape

- The contract uses `#![no_std]`.
- State is held in an explicit state/data struct.
- Services borrow shared state through `RefCell` or another intentional state holder.
- `#[program]` exposes `init` and the intended services.
- Each `#[service]` has a clear responsibility.
- Multiple services share state intentionally instead of duplicating ownership.
- Public read methods are explicit; callers do not need to inspect internal state.

## Public API

- Exported method names, parameter order, and return types are intentional and stable enough for generated clients.
- Business errors that callers should observe use `#[export(unwrap_result)]`.
- `#[export(payable)]` is used only for constructors or methods that require positive incoming value.
- Payable methods do not add redundant `value == 0` checks.
- Events are emitted for meaningful state transitions.
- Event field types are build-tested on the current `ethexe` path.
- Public input/output types are simple enough for Sails IDL generation.

## ABI-Facing Surface

- If Solidity tooling is planned, `cargo sails sol --idl-path ...` has been run early.
- ABI-facing public types are verified against the current `ethexe` Solidity generation path.
- Known type notes are respected: `u8` does not work on the current path; `i8`, `Vec<u8>`, and `String` work on the current path.
- If IDL generation produced a program name with `.opt`, the IDL was regenerated with `cargo sails idl --program-name <NameWithoutDot>`.
- `ActorId` versus Ethereum `address` conversion rules are explicit where they matter.

## `ethexe` Restrictions

- The contract does not use runtime randomness.
- The contract does not create another program from inside a running program.
- The contract does not use `msg_send_with_gas`, `msg_reply_with_gas`, or other `*_with_gas` helpers or wrappers.
- The contract does not use gas reservation or unreservation flows.
- The contract does not use reservation-based send or reply commit flows.
- The contract does not use signal syscalls.
- The contract does not use plain `wait`-based blocking behavior.
- The contract does not use delayed wake flows.

## Build Outputs

- `cargo build --release` passes.
- `cargo test --release` passes when tests exist.
- `target/wasm32-gear/release/*.idl` exists.
- `target/wasm32-gear/release/*.wasm` exists.
- `target/wasm32-gear/release/*.opt.wasm` exists.

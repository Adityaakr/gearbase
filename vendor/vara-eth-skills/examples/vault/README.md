# Vault Example

This example is a small Vara.eth Sails contract plus runnable interaction flows.

It demonstrates:

- a Rust/Sails contract built with the `ethexe` feature
- multiple services sharing state (`vault` and `admin`)
- payable deposit and value-returning withdraw
- generated IDL and Solidity ABI interface usage
- TypeScript interaction with `@vara-eth/api`, `viem`, and `sails-js/parser`

## Workspace

- `vault` builds the WASM binary and IDL file.
- `vault-app` contains the contract logic.
- `vault-client` contains the generated Rust client used by tests.
- `ts/` contains runnable TypeScript scripts.
- `Vault.sol` is generated from the Sails IDL and kept as an ABI reference.

## Build

```bash
cargo build --release
```

Expected artifacts:

```text
target/wasm32-gear/release/vault.opt.wasm
target/wasm32-gear/release/vault.idl
```

## Test

```bash
cargo test --release
```

## TypeScript Checks

```bash
npm run check
```

The TypeScript scripts read configuration from environment variables. Start with `.env.example`, but do not commit real private keys.

## ABI Interface

Regenerate the Solidity ABI interface after IDL changes:

```bash
cargo sails sol --idl-path target/wasm32-gear/release/vault.idl
```

Generated `.sol` files include callback stubs with `TODO` comments. Application contracts should implement callbacks in their own adapter or caller contract.

## License

The source code is licensed under the [MIT license](LICENSE).

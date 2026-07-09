# Vara.eth Implementation Source Map

Primary implementation repository:

- the `ethexe/` subtree of `https://github.com/gear-tech/gear.git`

Canonical areas:

- Contracts: `ethexe/contracts/src`
- Contract ABIs/artifacts: `ethexe/ethereum/abi`
- CLI: `ethexe/cli/src`
- RPC server: `ethexe/rpc/src`
- Rust SDK wrappers: `ethexe/sdk/src`
- Runtime behavior: `ethexe/runtime`
- Processing behavior: `ethexe/processor`
- Service behavior: `ethexe/service`

Useful verification targets:

- `cargo build` from `ethexe` for compile checks.
- `cargo test` from `ethexe` for behavior covered by Rust tests.
- Use targeted `rg` searches for exact method names, event names, error strings, RPC methods, and CLI flags instead of scanning the whole repository manually.

Record findings with exact file paths. When a branch, tag, or commit matters, include it in the final notes.

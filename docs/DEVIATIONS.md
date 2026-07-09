# Deviations

Record any place where the implementation diverges from `gearbase-spec.md`.

Use this format:

## <short title>

- spec section:
- implemented behavior:
- reason:
- source:

## Current CLI syntax drift

- spec section: 2, 9
- implemented behavior: current `sails-cli 2.0.0` uses `cargo sails sol <IDL_PATH>` instead of `cargo sails sol --idl-path <IDL_PATH>`.
- reason: verified current CLI behavior differs from the vendored example README text.
- source:
  - `vendor/vara-eth-skills/examples/escrow/README.md`
  - `cargo sails sol --help`

## wVARA decimals conflict

- spec section: 1, 5.5, 6.5, 13
- implemented behavior: no sponsor-UX math or top-up estimation was encoded yet because the source-of-truth currently conflicts on decimals.
- reason: vendored skills/playbooks say `12` decimals while current official docs say `18` decimals.
- source:
  - `vendor/vara-eth-skills/skills/vara-eth-app-builder/SKILL.md`
  - `vendor/vara-eth-skills/playbooks/vara-eth-ethexe-cli-workflow.md`
  - `https://wiki.vara.network/docs/vara-eth/economics/wvara-overview`
  - `https://wiki.vara.network/docs/vara-eth/interact/funding-executable-balance`

## Local dev compatibility split

- spec section: 9 phase 0
- implemented behavior: local-node verification currently requires a compatibility-aware split:
  - `ethexe 2.0.0` provides workable `run --dev`,
  - `1.10.x` example artifacts do not upload cleanly into that runtime,
  - fresh `sails-rs 2.0.0` scaffolding currently failed due missing `gear-wasm-builder = "=2.0.0"` from crates.io during verification.
- reason: platform/example/tooling versions are not aligned cleanly in the current environment.
- source:
  - `/tmp/ethexe-v2.0.0-aarch64-apple-darwin/ethexe run --help`
  - local upload failure against `vault.opt.wasm`
  - `cargo sails new ... --eth` failure logs

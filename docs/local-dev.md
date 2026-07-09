# Local Dev Notes

Verified local tooling notes during Phase 0:

- `ethexe 2.0.0` can run a local dev node
- current dev-node startup required `--validators-malachite-pub-keys`
- the JSON mapping used in this repo is `docs/local-dev/validators-malachite-pub-keys.json`

Observed compatibility split:

- `ethexe 2.0.0` local runtime starts successfully with the validator mapping
- vendored `1.10.x` example artifacts did not upload cleanly into that runtime
- `sails-cli 2.0.0` scaffolding was also blocked by an unresolved crates.io dependency for `gear-wasm-builder = "=2.0.0"`

This means the local-node path is useful for protocol verification, but it is not yet a clean substitute for the Hoodi end-to-end test path.

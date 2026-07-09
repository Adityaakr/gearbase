# gearbase - agent instructions

You are building gearbase per `./gearbase-spec.md`.

Authority order:

1. `vendor/vara-eth-skills` repo contents, skills, playbooks, and examples
2. Official Vara.eth docs and wiki
3. `gearbase-spec.md`
4. Engineering judgment

Rules:

1. Work in the phase order from `gearbase-spec.md` section 9. Do not start a new phase until the current phase acceptance checks pass.
2. The primary implementation reference for transport, wallet UX, and room write/read flows is the injected app guidance in the vendored Vara.eth skills repo.
3. Never invent Vara.eth APIs, CLI flags, contract addresses, signing flows, or event transport behavior.
4. Record platform findings with source links in `docs/PLATFORM_NOTES.md`.
5. Keep unresolved items in `docs/OPEN_QUESTIONS.md`.
6. Record spec and implementation mismatches in `docs/DEVIATIONS.md`.
7. Log phase completion and measured outcomes in `docs/PROGRESS.md`.
8. Secrets only via `.env` files. Ship `.env.example`. Never print or commit keys.
9. Testnet is Hoodi unless a documented local-node flow is better for the task.
10. Prefer boring, verifiable code. Every program command needs rejection-path tests.

Phase 0 operating procedure:

1. Vendor `vara-eth-skills` into `vendor/vara-eth-skills`.
2. Read the relevant skills before writing code:
   - `vara-eth-injected-app-builder`
   - `vara-eth-full-app-builder`
   - `vara-eth-app-builder`
   - `vara-eth-contract-writer`
3. Inspect the closest injected frontend example before designing the SDK.
4. Resolve section 13 Q1-Q8 from the spec into `docs/PLATFORM_NOTES.md` with exact sources and concrete answers.
5. Stop after Phase 0 acceptance passes. Do not begin Phase 1 early.

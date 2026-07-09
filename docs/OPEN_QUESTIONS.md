# Open Questions

This file tracks unresolved platform questions and temporary gaps while executing the spec.

## Section 13 checklist

- Q1. Push updates: documented answer recorded; no high-level third-party push API found.
- Q2. Injected tx sender requirements: documented answer recorded; fresh zero-balance empirical check still pending.
- Q3. Browser signing UX: documented/code answer recorded; no sanctioned delegation pattern found.
- Q4. Per-message compute and payload limits: still missing empirical per-op measurement. The wVARA decimals conflict is **resolved**: the token reports `12` decimals on chain, so `1 wVARA = 1e12` base units. See `docs/PLATFORM_NOTES.md`. Per-op cost remains unmeasured because no gearbase program has executed on chain yet.
- Q5. Timestamps: implementation-backed answer recorded.
- Q6. Event delivery: documented answer recorded; ring-buffer/query path remains preferred.
- Q7. Code upload flow: documented/CLI answer recorded.
- Q8. Public vara.eth node endpoints: documented answer recorded.

Move resolved items into `docs/PLATFORM_NOTES.md` with source links and concrete conclusions.

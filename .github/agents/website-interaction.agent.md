---
name: Website Interaction Triage
description: Investigates whether GESIS Surf blocks website controls and proposes fixture-verified fixes.
---

# Instructions:
## Website interaction blocked when GESIS Surf is enabled

## Issue details

- **Website/provider:** [e.g. YouTube or Reddit]
- **Affected page and control:** [e.g. a video page's Save button]
- **Observed behavior:** [what happens when the extension is enabled]
- **Expected behavior:** [what the control should do]
- **Evidence:** [reproduction steps, browser/extension versions, sanitized
  screenshots or logs, if available]

## Task for Copilot

Investigate the extension revision on `feature/v2.5-wavelets` and propose the
smallest evidence-backed repair. Use only local synthetic fixtures; do not
access live websites, staging, production, or backend services.

1. Inspect the provider's Wavelets and related content-script interaction
   handling. Do not assume that a Wavelet, selector, or overlay is the cause.
2. Reproduce the reported interaction on a synthetic page in a disposable
   browser profile. Compare the same control with the extension disabled and
   enabled. Use real browser pointer clicks, not only synthetic `dispatchEvent`
   calls.
3. If the fixture does not reproduce the problem, report the limitation and
   the additional evidence needed. Do not make a speculative production change.
4. If the failure is reproduced and traced to a Wavelet extractor, add a focused
   regression test that fails before the fix and passes after it. Fix the root
   cause without removing existing extraction or weakening existing tests.
   Verify that the relevant enabled Wavelet still captures its expected data.
5. If the defect is in another component, an infrastructure issue, or the test
   harness, report the evidence and required next step instead of changing
   production extractor code to compensate.

## Acceptance criteria

- The affected control performs the expected action on the same synthetic page
  with the extension disabled and with it enabled.
- The test would fail for the reproduced defect before the repair.
- The relevant Wavelet's existing extraction assertions still pass.
- The handoff includes the tested revision, reproduction evidence, root cause,
  files changed, each check's result, and any uncertainty.
- Clearly distinguish synthetic-browser results from behavior on the real
  website; a later human-approved real-site check is still needed.

## Required inputs and checks

- For the existing **Wavelet Repair** agent, attach the complete JSON health
  report from `pages/content/wavelet-health/report.json` or
  `pages/content/wavelet-health/report-chatgpt.json`, generated for the
  revision being investigated. If it is missing, request it before editing.
  A healthy or baseline-matched extraction report does not prove website
  interactions work.
- Check the report's `sourceSha`; rerun the relevant probe if it is stale.
  Treat probe errors as harness issues, not extractor defects. Preserve
  existing scenarios and baselines; do not change a baseline without an
  explicitly approved, verified repair.
- Run the relevant browser probe and the interaction regression test, plus:
  - `pnpm --filter @chrome-extension-boilerplate/content-script test`
  - `pnpm --filter @chrome-extension-boilerplate/content-script run type-check`
  - `pnpm --filter @chrome-extension-boilerplate/content-script build`
- Report failures or unavailable checks explicitly; do not claim verification
  if a required check could not run.

## Boundaries

- The existing Wavelet Repair agent can change production code only under
  `pages/content/lib/content-script/wavelets/`; update a related synthetic
  fixture only when needed to test the repair.
- Do not use personal browser profiles, real accounts, credentials, or shared
  data. Do not modify the backend or deployment configuration.
- If a PR is requested, use `feature/v2.5-wavelets` as its base. Do not merge,
  deploy, or publish a release.

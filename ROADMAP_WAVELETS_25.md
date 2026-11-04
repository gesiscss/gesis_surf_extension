# Wavelets API 2.5 — Roadmap & Design Document

**Status:** DECIDED DESIGN — not yet implemented
**Decided:** 2026-11-03/04 (owner + assistant, backend + extension review)
**Audience:** backend team (this repo) + extension team (`gesiscss/gesis_surf_extension`)
**Version context:** backend product is at **2.0.0** (paper line, prod). The wavelets
milestone is **2.5** — matching the extension's `feature/v2.5-wavelets` branch. This
document is the contract design both sides implement against.

---

## Table of contents

1. [Why this document exists](#1-why-this-document-exists)
2. [The problems being solved (D6, D8, D4)](#2-the-problems-being-solved)
3. [The key design decision: chained-time domain_session_id](#3-the-key-design-decision)
4. [The 2.5 JSON contract](#4-the-25-json-contract)
5. [Document lifecycle (the four cases)](#5-document-lifecycle)
6. [Edge rules](#6-edge-rules)
7. [What this does NOT change (non-goals)](#7-non-goals)
8. [Work items — backend side](#8-work-items--backend-side)
9. [Work items — extension side](#9-work-items--extension-side)
10. [The D7 gate (must be answered before implementation)](#10-the-d7-gate)
11. [Sequencing & release](#11-sequencing--release)
12. [Decision log](#12-decision-log)

---

## 1. Why this document exists

The wavelets feature (social + LLM telemetry in Elasticsearch) is backend-complete
and extension-branch-complete, but **two data-integrity races and one missing
ownership field** were identified during the security pass. They share a root
cause: **the wavelet document must carry the Postgres Domain UUID (`domain_id`) —
the join key for web-journey reconstruction — but that UUID only exists after a
server round-trip that can be slow or still in-flight when the wavelet fires.**

The fixes were designed jointly with the owner over 2026-11-03/04. This document
is the agreed design: it names every decision, the reasoning, and the exact work
items for each repo, so implementation can start on either side without
re-deriving context.

---

## 2. The problems being solved

### 2.1 D6 — wrong-domain misattribution (identification)

The extension's `sendDomain` (`DomainHandler.ts`) identifies the domain it just
created by **sorting ALL the tab's response domains by `start_time` and taking
the newest** (code comment: `"NEED TO CHECK"`). Millisecond-precision ties
(rapid reloads) can pick the **wrong domain** — the wavelet then links to the
wrong visit, which **corrupts the web journey silently** (worse than unlinked:
it is confidently wrong).

### 2.2 D8 — unlinked wavelets (ordering)

The extension's `resolveDomainId` (`WaveletEventManager.ts`) waits up to
**10 seconds** for the domain PATCH to complete (`waitForDomainReady`). On
heavy-JS pages the wait times out → the wavelet is sent with `domain_id: ""` →
recorded but **silently unjoinable**. The 10s wait is a client-side guess; the
race is fundamental: the wavelet can fire **before** the domain exists on the
server.

### 2.3 D4 — no ownership on wavelets documents (audit P2 #15)

Wavelets ES documents carry **no user field**. Ownership is only indirect via
the `domain_id` join — and for unlinked wavelets, not even that. Before any
wavelets read API exists, documents must be attributable per-user at write time
(**server-stamped, never client-supplied** — the BOLA principle).

**Root cause common to all three:** the wavelet's only reference to the browsing
context is the Domain UUID, which is server-assigned and may not exist yet.

---

## 3. The key design decision

### Chained-time `domain_session_id` — per-visit unique *(owner insight, 2026-11-04)*

`domain_session_id` is a **scope** (window + tab + url-stream), not an
identifier: the same session can legitimately contain **multiple visits to the
same URL** (the DB's own uniqueness constraint is
`(domain_title, domain_url, start_time)` — time is the disambiguator). The 2.5
design **chains the visit's timestamp onto the scope prefix**, making the key
unique per visit:

```
${windowSessionId}-tabId-${tabId}-domain-${urlPart}-${visitTime}
```

- `visitTime` = the domain payload's own `start_time` (generated **once** at
  page-complete, reused verbatim). Never call the clock twice for one visit —
  this is the rule that makes the key reproducible on both sides (the
  "circularity escape": the extension knows its visit's `start_time` even before
  the server confirms the row).
- The scope prefix stays readable (window/tab/url visible for debugging and
  analysis tooling).
- **Scope + moment jointly identify a visit** — exactly what the model already
  says.

### Storage impact — none (verified 2026-11-04)

| Surface | Impact |
|---|---|
| IndexedDB `domainslives` | **None.** `keyPath: 'domain_session_id'` keys on the field name, not the format — longer string, same key. No schema version bump. |
| Postgres `Domain.domain_session_id` | **None.** `CharField(blank=True)` with no max_length — no migration. |
| ES wavelets indexes | Field is **new to the mapping** anyway (2.5 addition, same batch as `user_id`). |
| Old rows | Old-format strings simply don't match new-format lookups. Only window: mid-session extension update, before the next visit writes a new-format row — degrades to today's blank case. Acceptable by design. |

---

## 4. The 2.5 JSON contract

Today the ES docs carry **only `domain_id`** (Keyword) — verified against the
index classes (`TwitterIndex`, `ChatGPTIndex`, and siblings). 2.5 adds **three
server-managed fields**:

```json
{
  "post_id": "abc123",
  "platform": "x",
  "signal_type": "feed",
  "author_handle": "someone",
  "content_text": "…",
  "likes": 12, "comments": 3, "reposts": 1, "bookmarks": 0, "views": 100,
  "permalink": "https://x.com/…",
  "post_timestamp": "2026-11-04T12:10:00Z",
  "captured_at": "2026-11-04T12:10:05Z",
  "page_url": "https://x.com/home",

  "domain_id": "913f8ac6-b09b-4681-8894-b16e914a23be",
  "domain_session_id": "sess-…-tabId-5-domain-x.com-2026-11-04T12:10:00Z",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "link_status": "linked"
}
```

| Field | Who sets it | Role | Lifetime |
|---|---|---|---|
| `domain_id` | extension (validated — BOLA fix live since `d9ea916`) or **Celery backfill** | **THE permanent join key.** Analysis code joins ONLY here. | permanent |
| `domain_session_id` | extension (computed locally, instantly) | Lookup hint for the backfill worker, race case only | transient (stale after resolution) |
| `user_id` | **server, from the token** — never the client | Ownership backstop (D4); scopes the backfill lookup | permanent |
| `link_status` | server | `linked` / `pending` / `expired` / `unlinked_by_policy` — makes data quality measurable | permanent |

Same additions apply to the LLM indexes (`chatgpt`, `claude`, `deepseek`,
`gemini`) and every social index (x, tiktok feed/played, youtube
feed/shorts/watch, instagram, linkedin, facebook feed/reels, reddit, threads,
twitch feed/stream).

**API surface:** `POST /api/social/` and `POST /api/llm/` accept `domain_id` (as
today, validated for ownership) **and additionally** `domain_session_id` (the
chained-time key). Both optional; the extension sends what it has: session id
always (instant), UUID when known.

---

## 5. Document lifecycle (the four cases)

```
                        wavelet arrives
                              │
              ┌───────────────┴────────────────┐
              │ domain_id present?              │
              ▼                                ▼
        YES (fast path)                 NO (race window)
   validate ownership (live)      store immediately: link_status=pending,
   stamp user_id, link_status=    domain_session_id + user_id stored,
   linked. No Celery.             domain_id="".
                                        │
                          bounded Celery backfill (~30–60s cadence,
                          few minutes window): exact-match
                          Domain.objects.filter(user_id=…,
                          domain_session_id=…) → update-by-query
                          stamps domain_id, flips to linked.
                                        │
                     ┌────────────────────┴───────────────┐
                     │ domain row appeared?              │
                     ▼                                   ▼
                YES → linked                       NO → retries exhausted
                                                     → link_status=expired
```

1. **`domain_id` known at arrival** (common case — domain PATCH landed first):
   validate (live BOLA fix), stamp `user_id`, `link_status: linked`. **Fast
   path unchanged — no Celery involved.**
2. **Race window** (domain PATCH in flight — the heavy-JS-page case): store
   immediately — **never reject, never hold the request** — as `pending` with
   the chained session id and `user_id`. The Celery backfill resolves and
   stamps.
3. **Domain never landed** (page never reached `complete`, network died):
   retries exhaust → `expired`. **Semantically correct**: no visit row
   exists, so there is nothing to join to — the journey never recorded that
   visit either. The doc remains, countable as a known orphan.
4. **Masked/denied by policy** (deliberate blank, unchanged today):
   `unlinked_by_policy` — never enters backfill.

**Why the hint must be stored in the doc:** the wavelet is the only place the
event's own moment exists. The worker has no other way to know "which visit was
in progress at 12:10:00 in tab 5". The hint is what makes the backfill possible;
analysis never joins on it.

---

## 6. Edge rules

| Case | Rule | Rationale |
|---|---|---|
| Same-millisecond reload | interval tie → latest `start_time` | Both rows describe one human continuous moment on one page — a rounding at the model's resolution boundary, not a data error. |
| Tab closed before `closing_time` PATCH | treat `closing_time` as "now" for interval membership | The interval must close for membership to be decidable. |
| Old-format wavelets (pre-2.5) | never in backfill set | Backward compatible; they keep today's semantics. |
| Clock trust | all timestamps are same-client-clock (`new Date().toISOString()` in the extension, for domain `start_time`/`closing_time` AND the wavelet `timestamp`/`captured_at`) | No cross-clock skew problem — the precondition for using time as the resolver. Server `default=timezone.now` is only a fallback the extension never hits. |
| Ownership on resolution | backfill lookup scoped by `user_id` | Session ids are guessable (contain masked URLs) unlike UUIDs — BOLA discipline applies to server-side resolution too. |

---

## 7. Non-goals

Explicitly rejected alternatives (so they don't get re-litigated):

- **`domain_session_id` as an analysis join key** — NO. One key (`domain_id`),
  always. The session id is a transient lookup hint only.
- **Rejecting unresolvable wavelets (400 + retry)** — NO. Wavelets are fire-once
  from content scripts; retry machinery or data loss would follow.
- **Server-side wait (request-held polling)** — NO. Holds a worker per wavelet;
  exactly the load heavy-JS pages would generate.
- **Read-time dual-key resolution (join on session id when domain_id blank)** —
  NO. Permanent two-key complexity tax on every analysis pipeline.

---

## 8. Work items — backend side (this repo)

| # | Item | Detail |
|---|---|---|
| B1 | Index mappings | Add `domain_session_id` (Keyword), `user_id` (Keyword), `link_status` (Keyword) to `BaseIndex` (or each index) — one mapping change for all wavelets indexes. |
| B2 | Serializers | `LLMDataSerializer` + `SocialPostSerializer`: accept optional `domain_session_id`; stamp `user_id` from `request.user` in `create()` (never trust payload); set `link_status` per lifecycle. Keep the live `validate_domain_id` (BOLA, `d9ea916`). |
| B3 | Resolution helper | Exact-match resolver: `Domain.objects.filter(user_id, domain_session_id)` → `domain_id`; interval-membership variant as defensive tie-break (edge rules §6) if multiple rows ever match. |
| B4 | Celery backfill task | `wavelets/tasks.py`: scan `link_status=pending` docs (bounded: created within the last N minutes), resolve, update-by-query stamp `domain_id` + `link_status=linked`; flip to `expired` after the retry window. Cadence ~30–60s, window a few minutes (tune in testing). |
| B5 | `TabSerializer.created_domains` (D6 Option 2) | Collect the `Domain` objects `_create_domains` creates; return as read-only `created_domains` in the tab response. Extension consumes exact IDs; sort-by-newest retires. |
| B6 | Tests | Deterministic race tests (write wavelet → assert pending → create domain → run backfill → assert linked; then the expiry path), mapping presence, ownership-scoping of the resolver, `created_domains` response shape. |
| B7 | No DB migration | Verified: Postgres `domain_session_id` has no max_length; nothing to migrate. |

## 9. Work items — extension side (`gesiscss/gesis_surf_extension`, `feature/v2.5-wavelets`)

| # | Item | Detail |
|---|---|---|
| E1 | `generateDomainSession` | Chain the visit's `start_time` (payload value, generated once, reused verbatim) onto the session id: `…-domain-${urlPart}-${visitTime}`. Keep the prefix readable. |
| E2 | `resolveDomainId` | **Stop the 10s wait.** Compute the chained session id locally (instant) and send it; include `domain_id` when the local store already has the row. Masked/denied → keep sending blank (policy-blank case unchanged). |
| E3 | `sendDomain` | Consume `data.created_domains` from the tab PATCH response (B5); pick by exact ID. Defensive tie-break (session id + newest) only if multiple entries ever appear. Retires the `"NEED TO CHECK"` sort heuristic. |
| E4 | `domainslives` handling | No schema change (keyPath keys on the field name). Optionally store the chained id consistently; old rows self-retire on the next visit. |
| E5 | Wavelet payloads | Send `domain_session_id` (always computable) alongside `domain_id` (when known) to `/api/social/` + `/api/llm/`. |

**No IndexedDB schema version bump, no Postgres migration, no extension
local-store migration** — the format change is a longer string in an existing
field (owner-verified, 2026-11-04).

---

## 10. The D7 gate (must be answered before implementation)

**Finding:** `domain_session_id` (and `tab_session_id`, `window_session_id`)
embed the user UUID in their format — `session_<user_uuid>_<timestamp>` (built
by both extension helpers and backend test helpers; user UUID visible in every
response that carries session ids, e.g. inside `domain_session_id` values).

**Why it gates 2.5:** today session ids live in Postgres + extension local
storage. The 2.5 design **stores them in Elasticsearch** (inside wavelet
documents) — they become durable, queryable, exported data-model surface. The
question must be answered *before* the mapping ships, not after.

**Decision needed (one of):**

- **Option A — document as intentional correlation.** If linking session ids to
  users is a research feature (panel traceability, per-user session
  reconstruction), document it in the research-data documentation and proceed.
- **Option B — dissociate.** Redesign the session id format to not embed the
  user UUID (e.g. hash the user id, or drop the uuid component). Costs: format
  change rides in the same 2.5 batch anyway (we're already changing the format
  — cheapest moment to also fix D7), but affects all session-id builders and
  the local stores.

**Pre-work:** check `GlobalSessionService.getGlobalSessionId` format to confirm
exactly where the user UUID enters the chain (window session id is the prefix
of domain session ids).

**Recommendation:** decide during the extension design session — Option B is
cheapest now (format already changing) if correlation is not a deliberate
feature.

---

## 11. Sequencing & release

```
NOW (wavelets branch unreleased = contract changes are FREE)
  │
  ├─ [GATE] D7 decision (A or B) ── blocks mapping shape
  │
  ├─ Backend 2.5 (B1–B7): mappings, serializers, resolver,
  │  backfill, created_domains, tests
  │
  └─ Extension pass (E1–E5): chained key, no-wait resolve,
     created_domains, payload switch
  │
  ▼
Release 2.5 (backend + extension coordinated — same milestone
as the extension's feature/v2.5-wavelets branch name)
  │
  ▼
Later (post-paper-acceptance): wavelets → dev → main PR ("paper v2")
```

- **Backend can start before the extension** — the 2.5 API is backward
  compatible (extension's current payloads keep working: `domain_id` validated
  as today, missing session id = today's behavior).
- **The extension switch is one coordinated change** (E1+E2+E3+E5 together),
  testable against the 2.5 backend on staging.
- **The 10s timeout and the sort heuristic both die** with the extension switch
  — they are the workarounds this design removes.

---

## 12. Decision log

| Date | Decision | Made by |
|---|---|---|
| 2026-11-03 | `domain_id` remains the single permanent join key; session id never an analysis key | owner |
| 2026-11-03 | D6 → Option 2 (`created_domains` in tab response); session-id+newest only as defensive tie-break | owner |
| 2026-11-03 | D8 → store + Celery backfill (option c); never reject, never hold requests | owner |
| 2026-11-03 | D4 (`user_id` stamping) rides in the 2.5 batch as prerequisite | owner |
| 2026-11-04 | Session id = scope, time = visit selector (constraint analysis); chained-time key adopted | owner (key insight) |
| 2026-11-04 | Chained-time key = "just a longer char" on all storage surfaces; no migrations anywhere | owner + verified |
| 2026-11-04 | Milestone named **2.5** (backend product 2.0.0 = paper line; wavelets = major 2.5, matching extension branch name) | owner |
| pending | **D7** — user-UUID embedding in session ids: document as feature vs. dissociate | owner — the gate |

---

*Related: SECURITY_ROADMAP.md (audit findings ledger — all P0s closed),
QA_TESTING_GUIDE.md (QA pass for the shipped hotfixes), OWASP_AUDIT_PLAN.md
(original audit context). Backend repo: `gesiscss/gesis_surf_backend` (branch
`wavelets`). Extension repo: `gesiscss/gesis_surf_extension` (branch
`feature/v2.5-wavelets`).*
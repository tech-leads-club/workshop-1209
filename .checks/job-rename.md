# Editar o nome de um Job

Sources:

- https://linear.app/tech-leads-club/issue/WAL-3/editar-o-nome-de-um-job - HTTP contract, UI outcome, out of scope, Unresolved defaults
- `docs/specs/job.md` - R1 trim + 400, R2 unique + 409, R4 session / any Role, R5 404 `Job not found`; D3 superseded by WAL-3
- `CONTEXT.md` - Job is the work site, not a Warehouse, no quantity
- `AGENTS.md` - route → service → repository, unit + HTTP proofs, Playwright not committed

Profile: light (AGENTS.md has no `tlc-implement` section). The work touches a screen; light cannot catch a screen nobody built. Playwright still runs because AGENTS.md requires it.

## Out of scope

- Job status, date, address - the issue excludes them
- Turning Job into Warehouse - CONTEXT.md: Job is not a Warehouse
- Quantity, Stock, or Issue changes - the issue excludes them
- Schema migration / new column - `name` already exists
- Repository suite of its own - AGENTS.md forbids it
- Playwright files in git - the journey runs at the end and the file is deleted

## Landing

Touches `jobRoutes`, `JobService`, `JobRepository`, `App.tsx` Job list, and `docs/specs/job.md`. Reuses create's trim / 400 / unique-to-409 mapping and the existing session hook. No new table or index.

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| Public rename contract | `PATCH /api/jobs/:id` body `{ name }`; `200` Job `{ id, name, createdAt }`; `400` / `404` / `409` / `401` `{ error, statusCode }` | PUT of the whole resource — invites replacing `id` / `createdAt` |

- Nothing else in this change is hard to reverse

## Checks

### S1 - Renomear um Job · 7 files · 52 KB · ~13k

**C1** - PATCH of a persisted Job `{ id: X, name: "Site A", createdAt: T }` with `{ "name": "Site B" }` returns `200` and `{ id: X, name: "Site B", createdAt: T }` with no `quantity`
Proof: `bun test apps/api/src/services/job.service.test.ts -t "updateById returns the updated Job and keeps id and createdAt"`
Proof: `bun test apps/api/test/jobs.integration.test.ts -t "PATCH /api/jobs/:id renames the Job and keeps id and createdAt"`

**C2** - PATCH of Job A `Site A` to `Site B` when Job B already has `Site B` returns `409` `{ "error": "Job already exists", "statusCode": 409 }` and GET still has A=`Site A` and B=`Site B`
Proof: `bun test apps/api/src/services/job.service.test.ts -t "updateById maps a unique-constraint error to 409"`
Proof: `bun test apps/api/test/jobs.integration.test.ts -t "PATCH /api/jobs/:id duplicate name returns 409 and keeps original names"`

**C3** - PATCH with `name` `""` or `"   "` returns `400` `{ "error": "name is required", "statusCode": 400 }` and GET still has `Site A` on that id
Proof: `bun test apps/api/src/services/job.service.test.ts -t "updateById with blank or whitespace name throws 400 and does not call repository.updateById"`
Proof: `bun test apps/api/test/jobs.integration.test.ts -t "PATCH /api/jobs/:id with blank or whitespace name returns 400 and does not persist"`

**C4** - PATCH `/api/jobs/00000000-0000-4000-8000-000000000000` with `{ "name": "Site B" }` returns `404` `{ "error": "Job not found", "statusCode": 404 }`
Proof: `bun test apps/api/src/services/job.service.test.ts -t "updateById throws 404 when the repository updates nothing"`
Proof: `bun test apps/api/test/jobs.integration.test.ts -t "PATCH /api/jobs/:id missing id returns 404"`

**C5** - PATCH `/api/jobs/:id` without a session returns `401` `{ "error": "Unauthorized", "statusCode": 401 }`
Proof: `bun test apps/api/test/jobs.integration.test.ts -t "PATCH /api/jobs/:id without a session returns 401"`

**C6** - PATCH with `{ "name": "  Site B  " }` returns `200` and the persisted name is `Site B`
Proof: `bun test apps/api/src/services/job.service.test.ts -t "updateById trims name before repository.updateById"`
Proof: `bun test apps/api/test/jobs.integration.test.ts -t "PATCH /api/jobs/:id trims name"`

**C7** - PATCH with `{ "name": "Site B", "quantity": 10 }` returns `200`, the body has no `quantity`, and GET of that id has no `quantity`
Proof: `bun test apps/api/src/services/job.service.test.ts -t "updateById ignores quantity"`
Proof: `bun test apps/api/test/jobs.integration.test.ts -t "PATCH /api/jobs/:id ignores quantity"`

**C8** - On the Job screen, changing the name in the row editor and saving shows the new name on the same id
Proof: `bunx playwright test /tmp/job-rename-ui.spec.ts -g "Job row save shows the new name"`

**C9** - Job has no quantity; Stock and Inventory screens gain no Job field or action; the Inventory Issue Job select lists the same id with the new name
Proof: `bun test apps/api/test/jobs.integration.test.ts -t "S9 jobs table has no quantity column"`
Proof: `bunx playwright test /tmp/job-rename-ui.spec.ts -g "Stock and Inventory stay without Job quantity and Issue select shows the new name"`

## Swept

- validation: C3, C6
- failure modes: C2, C3, C4
- idempotency and retry: C1 — repeating the same valid body is still `200` with the same `id` / `name` / `createdAt`; it does not create a row
- authorization: C5 + existing — session required; any Role; no 403 on this resource
- concurrency and ordering: n/a — SQLite last-write-wins; unique is C2, not a lock
- data lifecycle: C1 — overwrite `name`; `id` and `createdAt` stay; no backfill
- external-dependency failure: n/a — no I/O beyond local SQLite
- state transitions: n/a — Job has no state machine; status is out of scope
- observability: existing — `registerErrorHandler` logs the error

## Handoff

S1 = ~13k (52 KB / 4) across jobs route, service, repository, both test files, App.tsx, and the Job spec. Under 150k. One batch. No mid-feature handoff.

## Unresolved (defaults in force)

1. PATCH `400` error text is `name is required` — C3 uses this until someone replaces it
2. Row chrome is a name input and a Save action on the list row — C8 does not depend on click-to-edit

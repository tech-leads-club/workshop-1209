# job-rename Verification

**Verdict**: PASS
**Profile**: light
**Diff range**: 706d211..ebc36af
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

HEAD at verification: `ebc36afb7150f40bd7024e43ba14419b91f69771`.

## Binding sources

Skipped — profile `light` (AGENTS.md has no `tlc-implement` section). Step 1 (ui binding screens) did not run.

Sources listed on the checklist were opened so claims could be read; they were not used for a screen-enumeration pass:

| Source | Opened | Contradiction | Uncovered |
|---|---|---|---|
| WAL-3 Linear issue | yes — `get_issue` WAL-3 | n/a (step 1 skipped) | n/a |
| `docs/specs/job.md` | yes | n/a (step 1 skipped) | n/a |
| `CONTEXT.md` | yes | n/a (step 1 skipped) | n/a |
| `AGENTS.md` | yes | n/a (step 1 skipped) | n/a |

## Checks

Named tests: each `rg -n` hit below exists in the tree. Bun proofs ran in one invocation at HEAD (14 pass, 19 filtered, 0 fail). Playwright proofs ran in one invocation (2 pass).

| Check | Claim | Proof run | Evidence | Result |
|---|---|---|---|---|
| C1 | PATCH persisted Job `{ id: X, name: "Site A", createdAt: T }` with `{ "name": "Site B" }` → `200` `{ id: X, name: "Site B", createdAt: T }`, no `quantity` | bun `-t` (see Gate) — both named tests `(pass)` | `apps/api/test/jobs.integration.test.ts:160` — `expect(response.statusCode).toBe(200)`; `:162-166` — `expect(body).toEqual({ id: job.id, name: 'Site B', createdAt: job.createdAt })`; `:167` — `expect('quantity' in body).toBe(false)`. Unit: `apps/api/src/services/job.service.test.ts:113` — `expect(updated).toEqual(persisted)`; `:114` — `expect('quantity' in updated).toBe(false)` | PASS |
| C2 | PATCH Job A `Site A` → `Site B` when B already has `Site B` → `409` `{ "error": "Job already exists", "statusCode": 409 }`; GET still A=`Site A`, B=`Site B` | bun `-t` — both named tests `(pass)` | `apps/api/test/jobs.integration.test.ts:210` — `expect(response.statusCode).toBe(409)`; `:211-214` — `expect(response.json()).toEqual({ error: 'Job already exists', statusCode: 409 })`; `:218-221` — `expect.objectContaining({ id: jobA.id, name: 'Site A' })` and `{ id: jobB.id, name: 'Site B' }`. Unit: `apps/api/src/services/job.service.test.ts:131` — `expect(...statusCode).toBe(409)`; `:132` — `expect(...message).toBe('Job already exists')` | PASS |
| C3 | PATCH `name` `""` or `"   "` → `400` `{ "error": "name is required", "statusCode": 400 }`; GET still `Site A` on that id | bun `-t` — both named tests `(pass)` | `apps/api/test/jobs.integration.test.ts:241` — `expect(response.statusCode).toBe(400)`; `:242-244` — `expect(response.json()).toEqual({ error: 'name is required', statusCode: 400 })`; `:249` — `expect(rows.find(...)?.name).toBe('Site A')`. Unit: `apps/api/src/services/job.service.test.ts:147-148` — `statusCode` `400` and `message` `'name is required'`; `:151` — `expect(jobs.updateById.notCalled).toBe(true)` | PASS |
| C4 | PATCH `/api/jobs/00000000-0000-4000-8000-000000000000` `{ "name": "Site B" }` → `404` `{ "error": "Job not found", "statusCode": 404 }` | bun `-t` — both named tests `(pass)` | `apps/api/test/jobs.integration.test.ts:259` — `expect(response.statusCode).toBe(404)`; `:260-262` — `expect(response.json()).toEqual({ error: 'Job not found', statusCode: 404 })`. Unit: `apps/api/src/services/job.service.test.ts:166-167` — `statusCode` `404` and `message` `'Job not found'` | PASS |
| C5 | PATCH `/api/jobs/:id` without session → `401` `{ "error": "Unauthorized", "statusCode": 401 }` | bun `-t` — named test `(pass)` | `apps/api/test/jobs.integration.test.ts:272` — `expect(response.statusCode).toBe(401)`; `:273-275` — `expect(response.json()).toEqual({ error: 'Unauthorized', statusCode: 401 })` | PASS |
| C6 | PATCH `{ "name": "  Site B  " }` → `200`, persisted name `Site B` | bun `-t` — both named tests `(pass)` | `apps/api/test/jobs.integration.test.ts:292` — `expect(response.statusCode).toBe(200)`; `:293` — `expect(...name).toBe('Site B')`; `:297` — `expect(rows.find(...)?.name).toBe('Site B')`. Unit: `apps/api/src/services/job.service.test.ts:183` — `expect(jobs.updateById.firstCall.args).toEqual(['job-1', 'Site B'])` | PASS |
| C7 | PATCH `{ "name": "Site B", "quantity": 10 }` → `200`, body has no `quantity`, GET of that id has no `quantity` | bun `-t` — both named tests `(pass)` | `apps/api/test/jobs.integration.test.ts:313` — `expect(response.statusCode).toBe(200)`; `:315-319` — `expect(body).toEqual({ id, name: 'Site B', createdAt })`; `:320` — `expect('quantity' in body).toBe(false)`; `:325-330` — GET row equals `{ id, name: 'Site B', createdAt }` and `'quantity' in persisted` is `false`. Unit: `apps/api/src/services/job.service.test.ts:202` — `expect('quantity' in updated).toBe(false)`; `:203` — `firstCall.args` `['job-1', 'Site B']` | PASS |
| C8 | Job screen: change name in the row editor and save → new name on the same id | playwright (see Gate) — `Job row save shows the new name` ✓ | `/tmp/job-rename-ui.spec.ts:36` — `page.locator(\`li.job[data-id="${id}"]\`)`; `:39` — `expect(row.locator('input[name="name"]')).toHaveValue(renamed)`; `:40` — `expect(jobRowByName(page, renamed)).toHaveCount(1)` | PASS |
| C9 | Job has no quantity; Stock and Inventory gain no Job field or action; Inventory Issue select lists the same id with the new name | bun `-t` `S9 jobs table has no quantity column` `(pass)`; playwright `Stock and Inventory stay without Job quantity...` ✓ | Schema: `apps/api/test/jobs.integration.test.ts:363-367` — `expect(columns.map(...).sort()).toEqual(['created_at', 'id', 'name'])`; `:376-380` — same on `PRAGMA table_info(jobs)`. Stock: `/tmp/job-rename-ui.spec.ts:73` — `expect(page.locator('select[name="issueJobId"]')).toHaveCount(0)`; `:74` — `expect(page.locator('section.page label', { hasText: 'Job' })).toHaveCount(0)`. Issue select: `:77-78` — `option[value="${id}"]` `toHaveText(renamed)` | PASS |

### Named-test existence (`rg -n`)

| Proof name | Hit |
|---|---|
| `updateById returns the updated Job and keeps id and createdAt` | `apps/api/src/services/job.service.test.ts:101` |
| `updateById maps a unique-constraint error to 409` | `apps/api/src/services/job.service.test.ts:119` |
| `updateById with blank or whitespace name throws 400 and does not call repository.updateById` | `apps/api/src/services/job.service.test.ts:137` |
| `updateById throws 404 when the repository updates nothing` | `apps/api/src/services/job.service.test.ts:155` |
| `updateById trims name before repository.updateById` | `apps/api/src/services/job.service.test.ts:171` |
| `updateById ignores quantity` | `apps/api/src/services/job.service.test.ts:186` |
| `PATCH /api/jobs/:id renames the Job and keeps id and createdAt` | `apps/api/test/jobs.integration.test.ts:147` |
| `PATCH /api/jobs/:id duplicate name returns 409 and keeps original names` | `apps/api/test/jobs.integration.test.ts:191` |
| `PATCH /api/jobs/:id with blank or whitespace name returns 400 and does not persist` | `apps/api/test/jobs.integration.test.ts:227` |
| `PATCH /api/jobs/:id missing id returns 404` | `apps/api/test/jobs.integration.test.ts:253` |
| `PATCH /api/jobs/:id without a session returns 401` | `apps/api/test/jobs.integration.test.ts:266` |
| `PATCH /api/jobs/:id trims name` | `apps/api/test/jobs.integration.test.ts:279` |
| `PATCH /api/jobs/:id ignores quantity` | `apps/api/test/jobs.integration.test.ts:300` |
| `S9 jobs table has no quantity column` | `apps/api/test/jobs.integration.test.ts:361` — **existing**, not in `706d211..HEAD` |
| `Job row save shows the new name` | `/tmp/job-rename-ui.spec.ts:20` |
| `Stock and Inventory stay without Job quantity and Issue select shows the new name` | `/tmp/job-rename-ui.spec.ts:43` |

C1–C7 HTTP proofs and C1–C4/C6–C7 unit proofs are in the feature diff (`94ffb32`). C9's S9 proof is a pre-existing test; it still ran at this HEAD and still asserts the no-quantity schema. C8/C9 Playwright files are outside git (`/tmp`), as AGENTS.md requires.

## Test policy rows

Skipped — profile `light` (Coverage join / Test policy are `standard` / `ui`). No `## Test policy` section on the checklist.

## Faults injected

Skipped — profile `light` (fault injection is `standard` / `ui`).

## Swept (existing)

Rows that resolve to **existing** were checked against the code:

| Row | Cited constraint | Present |
|---|---|---|
| authorization: session required; any Role; no 403 | `registerAuth` preHandler; PATCH has no Role gate | yes — `apps/api/src/middleware/auth.ts:21-27` (`!request.session.userId` → 401); `apps/api/src/routes/jobs.ts:16-19` has no 403 / Role check |
| observability: `registerErrorHandler` logs the error | error handler logs | yes — `apps/api/src/middleware/error.ts:17` — `fastify.log.error(error)` |

Idempotency claimed under C1 is asserted at `apps/api/test/jobs.integration.test.ts:174-179` (second PATCH still `200` with the same `id` / `name` / `createdAt`).

## Gate

```
bun test apps/api/src/services/job.service.test.ts apps/api/test/jobs.integration.test.ts -t "<C1–C7 + S9 names>"
```

14 passed, 0 failed (57 expect() calls). Each named bun test printed `(pass)` individually.

```
/tmp/node_modules/.bin/playwright test job-rename-ui.spec.ts --config=/tmp/playwright.config.ts
```

2 passed, 0 failed.

The checklist's `bunx playwright test /tmp/job-rename-ui.spec.ts --config=/tmp/playwright.config.ts` failed to load tests (`Playwright Test did not expect test() to be called here` — `bunx playwright` resolved a different install than `/tmp/node_modules/@playwright/test`). Re-ran with the matching `@playwright/test` 1.63.0 binary; both named UI tests passed.

## Gaps (non-blocking)

1. C8 — `/tmp/job-rename-ui.spec.ts:39` asserts `toHaveValue(renamed)` after `fill(renamed)` on the same input. The expected value is readable, but the assertion does not isolate Save from the typed draft.
2. C9 — Inventory "gain no Job field or action" has no absence assertion; Stock does (`:73-74`). Inventory is proven only for the Issue select text/id (`:77-78`).
3. C9 — schema proof is untouched pre-existing `S9 jobs table has no quantity column`. It ran at HEAD and asserts `['created_at', 'id', 'name']`; it is not new behaviour from this diff.

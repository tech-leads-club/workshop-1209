# Job

Status: Approved
Roadmap: 3. Job

## Goal

A signed-in User registers a Job as a named work site. The Job exists so later slices can issue quantity to it and assign Staff. A User may also rename a Job after it is created.

## Out of scope

- Quantity, Stock, or Issue on a Job
- Staff, Assignment, Requisition
- Status, date, address, code, client, or turning Job into Warehouse
- Role-restricted create, update, or delete
- Finance, payroll, BOQ, RFQ, subcontract

## Domain rules

- **R1** A Job has a name. The name is stored trimmed. A blank or whitespace-only name is rejected with 400 and nothing is persisted.
- **R2** Job name is unique. A second Job with the same name is rejected with 409 and the first row stays. Rename to an existing name is the same 409.
- **R3** A Job does not hold quantity. The table and the HTTP body have no quantity field. This slice does not create Issue.
- **R4** Any signed-in User (Administrator or Operator) may list, create, update, and delete a Job. A request without a session is rejected with 401. This slice has no 403.
- **R5** Delete or update of an unknown id is rejected with 404. Delete of an existing Job succeeds and the row is gone.
- **R6** Create persists a UUID id and an ISO-8601 `createdAt` and returns that record.
- **R7** Update changes only `name`. `id` and `createdAt` stay. Extra fields such as `quantity` are ignored.

## Scenarios

### S1 — empty list

Covers: R4

- **Given** no Job rows and a signed-in User
- **When** GET `/api/jobs`
- **Then** 200 and `[]`

### S2 — create

Covers: R1, R6

- **Given** a signed-in User
- **When** POST `/api/jobs` with `{ "name": "Site A" }`
- **Then** 201 and a body with UUID `id`, `name` `"Site A"`, ISO-8601 `createdAt`, and no `quantity`

### S3 — list contains the created Job

Covers: R4, R6

- **Given** a Job created as in S2
- **When** GET `/api/jobs`
- **Then** 200 and a one-element list whose `id`, `name`, and `createdAt` match the created record

### S4 — trim name

Covers: R1

- **Given** a signed-in User
- **When** POST `/api/jobs` with `{ "name": "  Site A  " }`
- **Then** 201 and `name` is `"Site A"`

### S5 — blank name

Covers: R1

- **Given** a signed-in User
- **When** POST `/api/jobs` with blank or whitespace `name`
- **Then** 400 `{ "error": "name is required", "statusCode": 400 }` and GET `/api/jobs` is still `[]`

### S6 — duplicate name

Covers: R2

- **Given** a Job named `"Site A"`
- **When** POST `/api/jobs` with `{ "name": "Site A" }` again
- **Then** 409 `{ "error": "Job already exists", "statusCode": 409 }` and GET `/api/jobs` still has one row named `"Site A"`

### S7 — delete

Covers: R5

- **Given** a created Job
- **When** DELETE `/api/jobs/:id`
- **Then** 204 and GET `/api/jobs` does not contain that `id`

### S8 — delete missing

Covers: R5

- **Given** a signed-in User and no Job with that id
- **When** DELETE `/api/jobs/:id` for an unknown UUID
- **Then** 404 `{ "error": "Job not found", "statusCode": 404 }`

### S9 — no quantity column

Covers: R3

- **Given** the schema
- **When** the `jobs` table is inspected
- **Then** columns are only `id`, `name`, `created_at`

### S10 — unauthenticated

Covers: R4

- **Given** no session
- **When** GET `/api/jobs`
- **Then** 401 `{ "error": "Unauthorized", "statusCode": 401 }`

### S11 — Operator creates

Covers: R4

- **Given** a signed-in Operator
- **When** POST `/api/jobs` with `{ "name": "Site A" }`
- **Then** 201 and the Job is persisted

### S12 — Job screen

Covers: R1, R4, R5, R7

- **Given** a signed-in User on the Job screen
- **When** they create a Job, see it in the list, rename it, then delete it
- **Then** the list shows the new name after create, the renamed name after save, and no longer shows it after delete

### S13 — rename

Covers: R1, R6, R7

- **Given** a Job `{ id: X, name: "Site A", createdAt: T }` and a signed-in User
- **When** PATCH `/api/jobs/X` with `{ "name": "Site B" }`
- **Then** 200 and `{ id: X, name: "Site B", createdAt: T }` with no `quantity`

### S14 — rename unique

Covers: R2

- **Given** Job A named `"Site A"` and Job B named `"Site B"`
- **When** PATCH `/api/jobs/A` with `{ "name": "Site B" }`
- **Then** 409 `{ "error": "Job already exists", "statusCode": 409 }` and GET still has A=`Site A` and B=`Site B`

### S15 — rename blank

Covers: R1

- **Given** a Job named `"Site A"`
- **When** PATCH `/api/jobs/:id` with blank or whitespace `name`
- **Then** 400 `{ "error": "name is required", "statusCode": 400 }` and GET still has `name` `"Site A"` on that id

### S16 — rename missing

Covers: R5

- **Given** a signed-in User and no Job with that id
- **When** PATCH `/api/jobs/00000000-0000-4000-8000-000000000000` with `{ "name": "Site B" }`
- **Then** 404 `{ "error": "Job not found", "statusCode": 404 }`

### S17 — rename unauthenticated

Covers: R4

- **Given** no session
- **When** PATCH `/api/jobs/:id`
- **Then** 401 `{ "error": "Unauthorized", "statusCode": 401 }`

### S18 — rename trims

Covers: R1

- **Given** a Job named `"Site A"`
- **When** PATCH `/api/jobs/:id` with `{ "name": "  Site B  " }`
- **Then** 200 and the persisted `name` is `"Site B"`

### S19 — rename ignores quantity

Covers: R3, R7

- **Given** a Job named `"Site A"`
- **When** PATCH `/api/jobs/:id` with `{ "name": "Site B", "quantity": 10 }`
- **Then** 200, the body has no `quantity`, and GET of that id has no `quantity`

## HTTP contract

| Method | Path | Auth | Success | Errors |
| --- | --- | --- | --- | --- |
| GET | /api/jobs | session, any Role | 200 array | 401 |
| POST | /api/jobs | session, any Role | 201 body | 400, 401, 409 |
| PATCH | /api/jobs/:id | session, any Role | 200 body | 400, 401, 404, 409 |
| DELETE | /api/jobs/:id | session, any Role | 204 | 401, 404 |

Request body (POST and PATCH):

- `name` — string, required, trimmed
- Extra fields such as `quantity` are ignored

Response body (POST, PATCH, and list item):

- `id` — UUID string
- `name` — string
- `createdAt` — ISO-8601 string

## Technical decisions

- **D1** Job is its own resource at `/api/jobs`, with the same route → service → repository trio as Warehouse. Rejected: nest under Warehouse or reuse the warehouses table. Why: a Job is not a Warehouse.
- **D2** Unique index on `name`. The service maps a SQLite unique violation to 409 and does not `findByName`. Rejected: pre-check by name. Why: same contract as Warehouse name and Item SKU.
- **D3** `PATCH /api/jobs/:id` renames a Job. Body `{ name }`. `id` and `createdAt` do not change. Rejected: PUT of the whole resource. Why: PUT invites replacing `id` / `createdAt`. WAL-3 supersedes the earlier “no update endpoint” decision.
- **D4** Session only; both Roles may write. Rejected: Administrator-only create and 403. Why: that authz pattern does not exist yet and the actor for this slice is any signed-in User.
- **D5** Schema is `id`, `name`, `created_at` only. Rejected: quantity or `warehouseId` on Job. Why: quantity lives in Stock; Job is not a Warehouse.

## Test obligations

- Service unit: S2, S4, S5, S6, S7, S8, S13–S16, S18, S19 (every branch that changes the outcome). List (S1/S3) is a pass-through like Warehouse.
- HTTP + real DB: S1–S11 and S13–S19, including unique index (S6, S14) and columns (S9)
- Playwright MCP: S12 — Job screen create, list, rename, delete. No Playwright files in git.

## Likely files

- `apps/api/src/routes/jobs.ts`
- `apps/api/src/services/job.service.ts`
- `apps/api/src/services/job.service.test.ts`
- `apps/api/src/repositories/job.repository.ts`
- `apps/api/test/jobs.integration.test.ts`
- `apps/api/src/db/schema.ts`
- `apps/api/src/server.ts`
- `apps/api/src/container/service-registration.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/App.css`

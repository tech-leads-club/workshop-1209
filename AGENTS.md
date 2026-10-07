# [AGENTS.md](http://AGENTS.md)

Classroom ERP. Language lives in `CONTEXT.md`. Domain terms are English — in `CONTEXT.md`, code, and UI. No Portuguese synonyms. Do not reopen what is already decided.

## Layers

Request path: `routes/` → `services/` → `repositories/`, same level. The next resource copies that trio.

DI: homemade container, concrete classes. The service takes the repository class. Unit tests stub it with `sinon.createStubInstance`.

HTTP: domain under `/api/...`. Health is `GET /health`. Errors: throw `Error` with `statusCode`; the middleware responds `{ error, statusCode }`. No error class hierarchy.

## Tests that stay in the repo

`bun:test` on the API. Obligations add up: a green integration test does not replace the service suite.

| Layer            | What it proves                                                                   | How                                                                                           |
| ---------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Service          | every branch that changes the outcome                                            | unit, `sinon.createStubInstance` of the repository, no IO                                     |
| Route + DB       | HTTP contract and the unique index (`200 []`, `201`, `400`, `409`, `204`, `404`) | `createServer()` + `fastify.inject()` + real SQLite — this path also goes through the service |
| Repository alone | nothing                                                                          | no suite of its own                                                                           |
| Web              | nothing in git                                                                   | Playwright at the end of the change — MCP, not a suite in the repo                            |

- Unit stub: `sinon.createStubInstance(ItemRepository)` — then `items.create.resolves()` / `.rejects(err)`; assert `calledOnce`, `notCalled`, `firstCall.args`. Never `new ItemRepository` in the service suite.
- Unique SKU: the service maps a SQLite unique violation to `409` (unit, stub rejects with that error). The unique _index_ is proven by integration. The service does not `findBySku`.
- `container.clear()` before a second `createServer()`. Without it: `Already registered`.

## Linear backlog

Use the team Wald-test for backlog for this project in Linear

## Screens

A change that touches a screen (UI, layout, styling, routing, client state, rendered data) is unfinished until Playwright has exercised the flow. Use the Playwright MCP against the running web app (`http://localhost:5173`). Click, type, submit, navigate — a first-paint screenshot does not count. Related routes that share the same state must still match. If it fails, fix and run again. Do not add Playwright files to git.

## Roadmap

Every time a roadmap item is completed mark it as done in the ROADMAP.md

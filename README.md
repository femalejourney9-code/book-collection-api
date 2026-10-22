# Book Collection API

A small in-memory REST API for a book collection, built with Node.js and Express.

## Run

```bash
npm install
npm start
# -> Book Collection API listening on http://localhost:3000
```

Copy `.env.example` to `.env` if you want to change the port; `PORT` defaults to
`3000`. (`npm start` reads the shell environment, so either `export PORT=4000`
or use a runner that loads `.env`.)

## Data model

| Field  | Type   | Rules                                        |
| ------ | ------ | -------------------------------------------- |
| id     | int    | server-assigned, read-only, starts at 1      |
| title  | string | required on create, non-empty                |
| author | string | required on create, non-empty                |
| year   | int    | optional, integer > 0, or `null`             |
| rating | int    | optional, integer 1-5, or `null`             |

Data lives in a plain array. Restarting the process resets the collection to the
three seed books (The Hobbit, Dune, Neuromancer) and resets ids to 1.

## Endpoints

| Method | Path         | Success | Notes                                     |
| ------ | ------------ | ------- | ----------------------------------------- |
| GET    | /books       | 200     | full collection                           |
| GET    | /books/:id   | 200     | single book                               |
| POST   | /books       | 201     | create; returns the created book          |
| PUT    | /books/:id   | 200     | **full replace**                          |
| PATCH  | /books/:id   | 200     | **partial update**                        |
| DELETE | /books/:id   | 200     | returns `{"deleted": {...}}`              |

### PUT vs PATCH

This is the one place the API is opinionated, so read it before integrating.

**PUT replaces the whole resource.** `title` and `author` are required, and any
omitted optional field is reset to `null` — it does not keep its old value.

```
PUT /books/1  {"title":"The Hobbit","author":"J.R.R. Tolkien"}
# -> {"id":1,"title":"The Hobbit","author":"J.R.R. Tolkien","year":null,"rating":null}
```

**PATCH updates only what you send.** Everything else is left untouched. An
empty body is a 400, not a silent no-op.

```
PATCH /books/1  {"rating":3}
# -> year and title/author unchanged, rating now 3
```

Rule of thumb: use PUT when you have the complete record, PATCH when you have a
field or two.

## Validation and errors

Every error response is JSON: `{"error": "<message>"}`.

| Status | When                                                                 |
| ------ | -------------------------------------------------------------------- |
| 400    | missing/blank title or author, year <= 0 or non-integer, rating outside 1-5, unknown field, `null` on a non-nullable field, malformed JSON, empty PATCH body |
| 404    | unknown id, or an unmatched route (JSON catch-all)                   |
| 413    | request body over the size limit                                     |
| 415    | request carries a body but `Content-Type` is not `application/json`  |
| 500    | unexpected server error (logged server-side, never leaks a stack)    |

Notes:

- Unknown fields are rejected rather than ignored, so typos surface as 400s
  instead of silently doing nothing. Allowed fields are `title`, `author`,
  `year`, `rating`.
- `year` and `rating` may be explicitly set to `null` to clear them. `title` and
  `author` may not.
- A request with no body at all (GET, DELETE) is not subject to the
  Content-Type check; a write with the wrong type is rejected before any route
  logic runs.
- `year` and `rating` must be integers — `3.5` is a 400, not a rounding.

## Examples

```bash
# list
curl localhost:3000/books

# create
curl -X POST localhost:3000/books \
  -H 'Content-Type: application/json' \
  -d '{"title":"Snow Crash","author":"Neal Stephenson","year":1992,"rating":5}'

# partial update
curl -X PATCH localhost:3000/books/4 \
  -H 'Content-Type: application/json' -d '{"rating":3}'

# full replace (year/rating become null)
curl -X PUT localhost:3000/books/4 \
  -H 'Content-Type: application/json' \
  -d '{"title":"Snow Crash","author":"Neal Stephenson"}'

# clear an optional field
curl -X PATCH localhost:3000/books/4 \
  -H 'Content-Type: application/json' -d '{"rating":null}'

# delete
curl -X DELETE localhost:3000/books/4
```

## Project layout

```
server.js       the whole API (routes, validation, error handling)
package.json    deps and the start script
.env.example    PORT
```

## Not included

No persistence, no auth, no rate limiting, no pagination, no tests. The store is
in-memory by design for this exercise.

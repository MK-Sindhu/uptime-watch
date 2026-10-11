# Uptime Watch

## Plan

1. Turborepo initialize
2. Create a Node.js backend with Express, exposes 1 endpoint
3. Add Prisma to it (as a separate package)
4. Complete the CRUD app
5. Decide the queue you'll use (SQS, NATS, Redis Streams, Kafka)
6. Create the publisher
7. Create the worker
8. Use a timeseries DB (ClickHouse) to shove timeseries data

## Database (Prisma 8 + PostgreSQL)

The database package lives in `packages/store`. The data model is in
`packages/store/prisma/schema.prisma`. Prisma 8 is still a release candidate,
so its commands differ from Prisma 7 (there is no `prisma studio`, no
`migrate dev`, no `generate`).

All commands below are run from `packages/store`:

```sh
cd packages/store
```

### 1. Start PostgreSQL

Postgres must be version 15 or newer. Start it in Docker and publish port 5432:

```sh
docker run -d --name uptime-pg \
  -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=mydb \
  -p 5432:5432 postgres:16
```

If the container already exists, run `docker start uptime-pg` instead.

### 2. Set `DATABASE_URL`

Copy `.env.example` to `.env` in `packages/store` and fill in the real value:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/mydb"
```

`prisma/db.ts` loads this file, so apps in other folders (`apps/api`) do not
need their own `.env`.

### 3. Emit the contract

Every time you change `prisma/schema.prisma`, regenerate the contract:

```sh
bun prisma contract emit
```

This writes `prisma/schema.json` and `prisma/schema.d.ts`. The app imports both,
so it will not start without them.

### 4. Create or update the tables

**First time, on an empty database:**

```sh
bun prisma db init
```

**After you change the schema (local dev database):**

```sh
bun prisma contract emit
bun prisma db update
```

Add `--dry-run` to `db update` to print the plan without changing anything. If
the change would delete data (dropping or renaming a column or table), Prisma
asks what to do. In scripts or CI, answer with `--delete <name>` or
`--rename <old>:<new>`.

### 5. Check that it worked

```sh
bun prisma db verify    # does the database match the contract?
bun prisma db schema    # show the tables that exist
bun prisma migration status                  # migration status
```

### Reset the database from scratch (deletes all data)

```sh
docker exec -it uptime-pg psql -U user -d mydb \
  -c 'DROP SCHEMA public CASCADE; DROP SCHEMA IF EXISTS prisma_contract CASCADE; CREATE SCHEMA public;'
bun prisma contract emit
bun prisma db init
```

### Migration files (shared branches and production)

`db update` writes no migration files, so use it only for your own local
database. For anything shared, plan a migration and apply it:

```sh
bun prisma contract emit
bun prisma migration plan --name add_feature   # writes migrations/app/<timestamp>_add_feature/
bun prisma db migrate     # applies pending migrations
bun prisma db verify
```

Commit the `migrations/` folder. If a migration needs a data backfill,
`migration plan` leaves a `placeholder(...)` in `migration.ts`. Fill it in, then
re-emit with `bun migrations/app/<dir>/migration.ts` before running `db migrate`.

### Using the database from code

Import the client from the `store` package. It connects lazily, so call
`connect()` once at startup:

```ts
import { db } from "store";

await db.connect();

const website = await db.orm.public.Website.create({
  url: "https://example.com",
  timeAdded: Temporal.Now.instant(), // DateTime columns use Temporal, not Date
});
```

`create()` takes the fields directly, with no `data: {}` wrapper.

### Viewing the data

Use a PostgreSQL client such as the VS Code PostgreSQL extension, TablePlus or
DBeaver. Connect to host `localhost`, port `5432`, with the user, password and
database name from `DATABASE_URL`. Or use `psql` in the container:

```sh
docker exec -it uptime-pg psql -U user -d mydb -c 'SELECT * FROM "Website";'
```

### Common problems

| Error | Fix |
|---|---|
| `Cannot find module './schema.json'` | Run `bun prisma contract emit`. |
| `Postgres binding not configured` | `DATABASE_URL` is empty. Check `packages/store/.env`. |
| `Postgres driver not connected` | Call `await db.connect()` before the first query. |
| `Unknown column "data"` | Pass the fields straight to `create()`, with no `data: {}` wrapper. |
| `encodes a Temporal.Instant, but received a Date` | Use `Temporal.Now.instant()` instead of `new Date()`. |
| `CONTRACT.MARKER_MISSING` / `MARKER_MISMATCH` | Run `bun prisma db init` (empty database) or `db update` to bring the database in line with the contract. |



### packages added
```
bun add zod 
bun add jsonwebtoken @types/jsonwebtoken
```
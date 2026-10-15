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

## Architecture

Uptime Watch checks websites on a schedule from one or more regions and shows
the results on a dashboard. A **pusher** queues every website in a Redis
stream. **Workers** in each region take websites off the queue, request them
and store the result in ClickHouse. The **API** combines users and websites
from Postgres with the latest results from ClickHouse, and the **frontend**
shows them.

### System map

```mermaid
flowchart TB
    browser(["Browser"])

    subgraph serving["Serving"]
        direction LR
        fe["fe<br/>Next.js 16 · :3001"]
        api["api<br/>Express · :3000"]
    end

    pg[("Postgres<br/>users · websites · regions")]

    subgraph pipeline["Check pipeline"]
        direction TB
        pusher["pusher<br/>every 30 s · exactly 1 replica"]
        redis[["Redis stream<br/>uptime-watch:website<br/>one consumer group per region"]]
        subgraph workers["workers · any number per region"]
            direction LR
            wr1["worker<br/>region1"]
            wr2["worker<br/>region2"]
        end
    end

    ch[("ClickHouse<br/>website_ticks + hourly summary")]
    sites{{"Monitored websites"}}

    browser -->|"pages and /api/*"| fe
    fe -->|"proxies /api/*"| api
    api -->|"users, websites"| pg
    api -.->|"rate-limit counters"| redis
    api -->|"latest 30 checks per site"| ch

    pg -->|"1 · every website"| pusher
    pusher -->|"2 · XADD url + id"| redis
    redis -->|"3 · XREADGROUP"| wr1
    redis -->|"3 · XREADGROUP"| wr2
    wr1 -->|"5 · insert batch"| ch
    wr2 -->|"5 · insert batch"| ch
    wr1 -->|"4 · HTTP GET"| sites
    wr2 -->|"4 · HTTP GET"| sites
    wr1 -.->|"6 · XACK"| redis
    wr2 -.->|"6 · XACK"| redis
```

### Life of a check

```mermaid
sequenceDiagram
    autonumber
    participant P as pusher
    participant PG as Postgres
    participant R as Redis stream
    participant W as worker (one region)
    participant S as website
    participant CH as ClickHouse
    participant API as api
    participant FE as fe (dashboard)

    loop every 30 s (CHECK_INTERVAL_SECONDS)
        P->>PG: read url + id of every website
        P->>R: XADD one message per website (stream capped at ~10k)
    end

    loop until SIGTERM
        W->>R: XAUTOCLAIM messages idle > 60 s (from workers that died)
        W->>R: XREADGROUP up to 5 new messages, wait up to 5 s
        loop each message, in parallel
            W->>S: GET url (10 s timeout)
            S-->>W: status code, or an error
        end
        W->>CH: INSERT the batch (Up = 2xx/3xx, otherwise Down)
        W->>R: XACK the batch, only after the insert succeeded
    end

    loop every 30 s while the dashboard is open
        FE->>API: GET /websites
        API->>PG: this user's websites
        API->>CH: latest 30 checks per website
        API-->>FE: websites, each with its checks
    end
```

### Components

| Component | Path | What it does | In Kubernetes |
|---|---|---|---|
| fe | `apps/fe` | Next.js app: dashboard, site detail pages with charts and incidents, public status pages. Forwards `/api/*` to the API. See [Frontend](#frontend). | Deployment, any number of replicas. `API_URL` is set when the image is built. |
| api | `apps/api` | Express REST API: sign-up and sign-in, websites, latest checks, health. Rate limited, with an OpenAPI spec at `/openapi.json` and docs at `/docs`. | Deployment, any number of replicas (rate limits are shared through Redis). `GET /health` for probes. |
| pusher | `apps/pusher` | Every 30 s (`CHECK_INTERVAL_SECONDS`), queues every website that isn't paused in the Redis stream. | Deployment with `replicas: 1`. A second pusher would double every check. |
| worker | `apps/worker` | Checks websites for one region and saves the results. | One Deployment per region (`REGION_ID`). Scale on the region's queue lag, e.g. with KEDA. |
| tests | `apps/tests` | `bun test` integration tests against a running API, including an end-to-end pipeline test. See [Tests](#tests). | Run in CI. |

| Shared package | Path | Used by | What it holds |
|---|---|---|---|
| store | `packages/store` | api, pusher | Prisma 8 client and schema for Postgres. |
| redisstream | `packages/redisstream` | pusher, worker | Redis client and stream helpers: add, read, re-claim, ack, create group. |
| timeseries | `packages/timeseries` | api, worker | ClickHouse client: `website_ticks` table and its hourly summary, batch insert, chart and incident queries, retention. |
| api-client | `packages/api-client` | fe | Typed TypeScript SDK generated from the OpenAPI spec. |
| ui, eslint-config, typescript-config | `packages/*` | nothing yet | Left over from the Turborepo template. |

### API

| Method and path | Auth | What it does |
|---|---|---|
| `POST /user/signup` | none | Creates a user: username 3–64 characters with no spaces at either end, password 8–128 characters. A broken rule answers 403 with a message saying which; a taken username answers 403 without one. The password is stored as an argon2id hash. |
| `POST /user/signin` | none | Returns `{ jwt }`, valid for 7 days (`JWT_EXPIRES_IN`). |
| `POST /website` | JWT | Adds a website for the signed-in user. Only `http(s)` URLs up to 2048 characters (411 otherwise), at most 20 websites per user (403 with a message, checked before the add-website rate limit). |
| `GET /websites` | JWT | The user's websites, each with its latest 30 checks, newest first. |
| `GET /status/:websiteId` | JWT | One website (`url`, `id`, `user_id`). |
| `GET /websites/:websiteId` | JWT | One website with its settings (`name`, `paused`, `public`). |
| `PATCH /websites/:websiteId` | JWT | Rename, pause/resume, or show/hide on the status page. |
| `DELETE /websites/:websiteId` | JWT | Stop watching and delete. Its ClickHouse checks expire by TTL (see [Retention](#retention)). |
| `GET /websites/:websiteId/overview?range=` | JWT | Uptime %, p50/p95/avg/max latency and latest status, in total and per region, plus `checkIntervalSeconds`. `1h`/`24h` read every check, `7d`/`30d`/`90d` read the hourly summary. |
| `GET /websites/:websiteId/series?range=&region=` | JWT | Response time and failures in buckets (60 × 1 min for `1h`, up to 180 × 12 h for `90d`). |
| `GET /websites/:websiteId/incidents?range=&limit=` | JWT | Outages: runs of failed checks, merged across regions. |
| `GET /websites/:websiteId/daily?days=&tz=` | JWT | Uptime per calendar day in the viewer's time zone. |
| `GET /fleet?range=` | JWT | All of the user's sites together: totals, latency over time and check flow. `range` is `1h` or `24h` only (400 otherwise). |
| `GET /regions` | JWT | Region ids and names. |
| `GET` / `PATCH /me/status-page` | JWT | Public status page address (`slug`) and title. |
| `GET /public/status/:slug` | none | A public status page: sites marked public, 90-day uptime, 30-day incidents. Cached 30 s. |
| `GET /health` | none | 200 when Postgres and ClickHouse both answer, otherwise 503. Never rate limited. |
| `GET /openapi.json` | none | The OpenAPI 3.1 spec. |
| `GET /docs` | none | Interactive API reference (Scalar). |

Send the JWT as the raw `Authorization` header value, without `Bearer `.
An expired token, or one without an expiry (issued before tokens expired),
answers 403; the frontend then signs the user out.
Any route except `/health` can answer `429` with a `Retry-After` header (see
[Rate limiting and DDoS protection](#rate-limiting-and-ddos-protection)).

### Data model

Postgres holds the things people create and change:

```mermaid
erDiagram
    user ||--o{ website : owns
    user {
        string id PK
        string username UK
        string password "argon2id hash"
        string status_slug UK "public page /status/slug"
        string status_title
    }
    website {
        string id PK
        string url
        string name "display name, optional"
        boolean paused "pusher skips it"
        boolean public "on the status page"
        string user_id FK
        datetime time_added
    }
    region {
        string id PK
        string name "region1, region2"
    }
```

ClickHouse holds every check result. It is append-only. Successful checks are
deleted after 5 days, failed checks after 90 (see [Retention](#retention)):

```sql
CREATE TABLE website_ticks (
    id               UUID,
    website_id       String,                  -- website.id in Postgres
    region_id        LowCardinality(String),  -- region.id in Postgres
    status           Enum8('Up' = 1, 'Down' = 2, 'Unknown' = 3),
    response_time_ms UInt32,
    created_at       DateTime64(3, 'UTC')
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(created_at)
ORDER BY (website_id, created_at)
TTL toDateTime(created_at) + INTERVAL 5 DAY DELETE WHERE status != 'Down',
    toDateTime(created_at) + INTERVAL 90 DAY DELETE
```

A materialized view (`website_ticks_hourly_mv`) adds every new check to
`website_ticks_hourly`: one row per website, region and hour with the up and
down counts, the latency sum and maximum, and p50/p95 quantile states. It is
kept for 90 days.

The old `website_tick` table in Postgres is no longer written to.

### Design decisions

- **One consumer group per region.** Redis delivers every message to every
  group, so every region checks every website. Inside a region, the workers
  share the messages, so adding workers adds capacity.
- **Ack only after saving.** A worker acks a batch only once ClickHouse has
  stored it. If the insert fails, or the pod dies mid-batch, the messages stay
  pending, and a worker re-claims them after 60 s. A check can therefore
  occasionally be stored twice, but it is never silently lost.
- **Postgres for state, ClickHouse for history.** Users and websites change and
  need constraints. Check results only ever get appended and are read as
  "latest N per site" or aggregated over time, which is what ClickHouse is
  built for.
- **What counts as down.** A 2xx or 3xx answer (after redirects) is Up. A 4xx
  or 5xx answer, a timeout (10 s), or no answer at all is Down. Some sites
  block automated checks, for example Cloudflare's bot protection, and show as
  Down even when they work in a browser.
- **Built for pods.** All configuration comes from environment variables. Each
  worker uses its pod's `HOSTNAME` as its consumer name. The consumer group and
  ClickHouse table create themselves on startup. Every service finishes its
  current work and exits on `SIGTERM`.

### Ports (local development)

| Service | Port |
|---|---|
| fe | 3001 |
| api | 3000 |
| Postgres | 5432 |
| Redis | 6379 |
| ClickHouse (HTTP) | 8123 |

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

## Check results (ClickHouse)

Users and websites live in Postgres. Every check result ("tick") lives in
ClickHouse, a column store built for this kind of append-only time series.
The code is in `packages/timeseries`.

```
pusher ──► Redis stream ──► worker ──► ClickHouse (website_ticks)
                                            ▲
API /websites ── websites from Postgres ────┘ latest 30 ticks per site
```

### Start ClickHouse

```sh
docker run -d --name uptime-clickhouse \
  -p 8123:8123 \
  -e CLICKHOUSE_DB=uptime -e CLICKHOUSE_USER=uptime -e CLICKHOUSE_PASSWORD=uptime \
  -e CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT=1 \
  --ulimit nofile=262144:262144 \
  -v uptime-clickhouse-data:/var/lib/clickhouse \
  clickhouse/clickhouse-server:25.8
```

If the container already exists, run `docker start uptime-clickhouse`. The
worker and API create the tables and the materialized view on startup, so a
new database needs no migration step.

### Retention

Checks run every 30 s. At 30 s, one site checked from 2 regions produces
about 5,760 checks a day, so not everything is kept:

| What | Kept for | Used for |
|---|---|---|
| Every check (`website_ticks`) | 5 days | Dashboard, the `1h` and `24h` charts, the latest status |
| Failed checks (`website_ticks`, `status = 'Down'`) | 90 days | Incidents and their timeline |
| Hourly summary (`website_ticks_hourly`) | 90 days | The `7d`, `30d` and `90d` charts, the 90-day uptime bar |

ClickHouse deletes expired rows itself (TTL), in the background, so old rows
can stay visible for a while after they expire. Successful checks older than 5
days survive only as hourly counts and latency percentiles; that is enough for
every chart, because none of them draws buckets smaller than an hour beyond
24 hours.

At 7 sites and 2 regions this is about 5 MB of checks, under 1 MB of failed
checks and about 6 MB of hourly summary, roughly 11 MB in all. It grows in
proportion to the number of sites and regions.

To change the check interval, set `CHECK_INTERVAL_SECONDS` to the same value
on the pusher and the API. The API uses it to tell one outage from the next
(failed checks more than 3 intervals apart, and at least 90 s apart, count
as separate incidents) and reports it to the frontend.

### Upgrade an existing database

A ClickHouse database created before this retention change has the old
90-day TTL and no hourly summary. Upgrade it once, while everything keeps
running:

```sh
cd packages/timeseries && bun scripts/migrate-retention.ts
```

It creates the hourly table and view, fills the summary from every check
already stored, and only then switches `website_ticks` to the new TTL, so no
check is deleted before it is summarised. It takes about a minute and a half,
because it waits for a time boundary so that no check is counted twice or
missed.

If the new API or worker started first, they have already created the view,
and the script skips the summary step. Run it with `--rebuild` to refill the
summary from scratch:

```sh
cd packages/timeseries && bun scripts/migrate-retention.ts --rebuild
```

Re-running it without `--rebuild` skips the steps that are done.

### Look at the data

```sh
docker exec -it uptime-clickhouse clickhouse-client -u uptime --password uptime -d uptime
```

```sql
SELECT website_id, status, count(), avg(response_time_ms)
FROM website_ticks
WHERE created_at > now() - INTERVAL 1 HOUR
GROUP BY website_id, status;
```

The old `website_tick` table in Postgres is no longer written to. Its rows were
copied into ClickHouse.

## Frontend

`apps/fe` (Next.js 16) talks to the API only through the generated client in
`packages/api-client`, via `apps/fe/lib/api.ts`. Pages:

| Route | What it shows |
|---|---|
| `/` | Sign in or create an account. |
| `/dashboard` | Every site with its status, a heartbeat trace of the last 30 checks, 24 h uptime and median latency, and per-region status. Search, filter (all, down, paused) and sort, kept in the URL. Rename, pause/resume, delete and copy from each row's menu. Status-page settings. Refreshes every 10 s. Fleet charts cover 1 h or 24 h. |
| `/sites/[id]` | One site: response time drawn as an ECG strip (1 h to 90 days, p50 and p95), uptime % and latency readouts, a 90-day uptime bar, one lead per region, and the incident timeline with CSV export. Range and region are kept in the URL. |
| `/status/[slug]` | A public status page, rendered on the server, no sign-in. Try `/status/demo`. |

Keyboard shortcuts (press `?` on the dashboard for the list): `/` search,
`n` add a site, `j`/`k` move between sites, `Enter` open, `1`–`5` change the
range on a site page, `⌘K` / `Ctrl K` command palette.

Data refreshes by polling every 10 s, so a new check (one every 30 s) shows up
within 10 s of being saved. Polling stops while the tab is hidden. It needs no
extra infrastructure, and it works with any number of API pods behind the load
balancer.

## API spec and generated client

The OpenAPI 3.1 spec is built in code (`apps/api/openapi.ts`). Request bodies
use the same zod schemas the API validates with, so the spec can't drift from
the validation. The API serves it at `GET /openapi.json`, with an interactive
reference at `GET /docs` (or `/api/docs` through the frontend).

`packages/api-client` is a typed TypeScript SDK generated from that spec by
[`@hey-api/openapi-ts`](https://heyapi.dev): one function per operation
(`signUp`, `signIn`, `createWebsite`, `listWebsites`, `getWebsite`,
`getHealth`), typed request bodies and responses. The frontend calls the API
only through it.

After changing a route or schema, regenerate both:

```sh
cd packages/api-client && bun run generate
```

This writes `apps/api/openapi.json` and then `packages/api-client/src/generated/`.
Commit both. Don't edit the generated files by hand.

The generator needs the TypeScript 5 compiler API, which TypeScript 7 doesn't
provide. That's why `packages/api-client` has its own `typescript@5.9.3` dev
dependency. The rest of the repo uses TypeScript 7.

Clients for other languages can be generated from the same
`apps/api/openapi.json`, for example with
[OpenAPI Generator](https://openapi-generator.tech).

## Rate limiting and DDoS protection

Protection works in layers. A flood big enough to fill the network link can
only be stopped in front of the cluster. The app's job is to stay fair and
cheap to run under load, and to stop the checker itself being used for abuse.

| Layer | What it does | Status |
|---|---|---|
| CDN / WAF in front of the cluster (e.g. Cloudflare, AWS Shield, Google Cloud Armor) | Absorbs volumetric floods, blocks known bad traffic and bots. | Recommended for production; not part of this repo. |
| Ingress / gateway | Per-IP connection and request-rate caps, body size cap, timeouts, before traffic reaches a pod. | To be configured with the Kubernetes manifests. |
| Kubernetes | Autoscale the API, set resource limits, and a NetworkPolicy so worker pods can't reach internal services (they request user-supplied URLs). | To be configured with the Kubernetes manifests. |
| API (this repo) | Everything below. | Done. |

What the API does (`apps/api/rate-limit.ts`, `apps/api/index.ts`):

| Protection | Limit (default) | Answer when hit |
|---|---|---|
| Requests per client IP, every route except `/health` | 120 per minute | 429 |
| Sign-up and sign-in per client IP (slows password guessing) | 20 per 15 minutes | 429 |
| Adding websites, per user | 10 per minute | 429 |
| Chart requests (overview, series, incidents, daily), per user | 120 per minute | 429 |
| Rename, pause, delete, status-page changes, per user | 30 per minute | 429 |
| Public status pages, per client IP | 30 per minute | 429 |
| Websites per account (stops one account making the workers hammer a site) | 20 | 403 with a message |
| Request body size | 10 kB | 413 |
| Slow clients (slowloris): headers must arrive within 10 s, the whole request within 15 s | | connection closed |
| Website URLs: `http`/`https` only, at most 2048 characters | | 411 |

- **Shared counters.** Counters live in Redis, so the limits hold across every
  API pod. With in-memory counters, three replicas would allow three times the
  limit.
- **Fails open.** If Redis is unreachable, requests are let through instead of
  failing. The API stays up and is just unlimited until Redis returns.
- **Standard headers.** Responses carry `RateLimit` and `RateLimit-Policy`
  headers (IETF draft-8), and every 429 has a `Retry-After` header.
- **The real client IP.** Limits are per client IP, so the API has to see the
  visitor's address, not its proxy's. It trusts `X-Forwarded-For` only from
  proxies on loopback or private networks: the Next.js server and the
  Kubernetes ingress. A client can't dodge the limit by sending a fake header.
  Locally, every browser request arrives through Next.js from `127.0.0.1`, so
  all local users share one bucket.
- **Tuning.** All limits can be changed with environment variables (see the
  table below). The tests in `apps/tests` send their own test addresses, so
  running them repeatedly doesn't use up your sign-in limit (see [Tests](#tests)).

## Running the services

The quick way, from the repo root:

```sh
./start.sh
```

It starts the Postgres, Redis and ClickHouse containers if they're stopped and
waits until they're ready. Then it runs the API, one worker per region in the
`region` table, the pusher and the frontend, with each service's output
prefixed by its name. Ctrl+C stops all of them; the containers keep running.
`START_FE=0 ./start.sh` skips the frontend. If your containers have other
names, set `PG_CONTAINER`, `REDIS_CONTAINER` and `CLICKHOUSE_CONTAINER`.

To run them by hand instead, start Postgres, Redis and ClickHouse first. Then
run each service in its own terminal:

```sh
cd apps/api    && bun --watch index.ts                                    # :3000
cd apps/worker && REGION_ID=<region id> WORKER_ID=local-1 bun index.ts
cd apps/pusher && bun index.ts                                            # only ONE pusher
cd apps/fe     && bun run dev                                             # :3001
```

`REGION_ID` must be the id of a row in the `region` table. The regions are
named `region1` and `region2`; `cd packages/store && bun scripts/seed-regions.ts`
creates any that are missing (with the name as the id).

### Environment variables (set these in Kubernetes)

| Variable | Used by | Default (local dev) |
|---|---|---|
| `DATABASE_URL` | api, pusher | from `packages/store/.env` |
| `REDIS_URL` | worker, pusher, api | `redis://localhost:6379` |
| `CLICKHOUSE_URL` | worker, api | `http://localhost:8123` |
| `CLICKHOUSE_USER` / `CLICKHOUSE_PASSWORD` | worker, api | `uptime` / `uptime` |
| `CLICKHOUSE_DB` | worker, api | `uptime` |
| `JWT_SECRET` | api | from `apps/api/.env` |
| `JWT_EXPIRES_IN` | api | `7d` (or `12h`, or a number of seconds) |
| `CHECK_INTERVAL_SECONDS` | pusher, api | `30` (set the same value on both) |
| `REGION_ID` | worker | required |
| `REGIONS` | migration job | `region1,region2` (region rows to create) |
| `WORKER_ID` | worker | the pod's `HOSTNAME` |
| `API_URL` | fe | `http://localhost:3000` |
| `RATE_LIMIT_PER_MINUTE` | api | `120` |
| `RATE_LIMIT_AUTH_PER_15_MIN` | api | `20` |
| `RATE_LIMIT_WEBSITES_PER_MINUTE` | api | `10` |
| `MAX_WEBSITES_PER_USER` | api | `20` |
| `RATE_LIMIT_AGGREGATES_PER_MINUTE` | api | `120` |
| `RATE_LIMIT_WEBSITE_WRITES_PER_MINUTE` | api | `30` |
| `RATE_LIMIT_PUBLIC_STATUS_PER_MINUTE` | api | `30` |
| `TRUST_PROXY` | api | `loopback, linklocal, uniquelocal` (on GKE, add Google's load balancer ranges; the deploy repo does) |

Notes for Kubernetes (the manifests are in the
[uptime-watch-deploy](https://github.com/MK-Sindhu/uptime-watch-deploy) repo):
- The API serves `GET /health`. It returns 200 only when Postgres and
  ClickHouse both answer, so use it as the readiness probe (the liveness
  probe only checks the port, so a database outage doesn't restart pods).
- The API, worker and pusher finish their current work and exit on `SIGTERM`.
- Run the pusher with `replicas: 1`. Every pusher queues every website, so two
  pushers check every site twice.
- Workers can scale out freely. If a worker pod dies mid-batch, another worker
  re-claims its unacknowledged checks after 60 seconds.

## Docker images

Five images, all built from the repo root. Each Dockerfile first runs
`turbo prune`, so an image only contains its own workspace and the packages
it imports.

| Image | Dockerfile | What's inside | Size |
|---|---|---|---|
| `api`, `worker`, `pusher` | `Dockerfile` (`--build-arg APP=…`) | One file made by `bun build`: the service and only the code it imports. No `node_modules`. Runs as the `bun` user. | about 285 MB, mostly the Bun base image |
| `migrate` | `Dockerfile` (`--target migrate`) | `packages/store` with the Prisma CLI. Runs `prisma db update --no-interactive` and the region seed, then exits. | about 1.9 GB (the Prisma 8 CLI) |
| `fe` | `apps/fe/Dockerfile` | Next.js standalone output on Node 24. `API_URL` defaults to `http://api:3000`, the API's Service in the cluster. | about 325 MB |

```sh
docker build --build-arg APP=api -t uptime-watch-api .
docker build --build-arg APP=store --build-arg APP_DIR=packages/store --target migrate -t uptime-watch-migrate .
docker build -f apps/fe/Dockerfile -t uptime-watch-fe .
```

The services run with a read-only root filesystem (plus a writable `/tmp`),
which is how the Kubernetes manifests start them.

## CI/CD

```mermaid
flowchart LR
    pr["pull request"] --> ci["ci.yml<br/>types, lint, API spec,<br/>tests, image builds + scan"]
    main["push to main"] --> cd["cd.yml<br/>ci.yml, then push images,<br/>then update the deploy repo"]
    cd --> gar[("Artifact Registry<br/>tag = commit SHA")]
    cd --> deploy[("uptime-watch-deploy<br/>overlays/production")]
    deploy --> argo["Argo CD syncs GKE"]
```

| Workflow | When | What it does |
|---|---|---|
| `.github/workflows/ci.yml` | every pull request (and inside `cd.yml`) | `bun run check-types` (every workspace), frontend lint, fails if `openapi.json` or the generated client is out of date, then all tests against Postgres, Redis and ClickHouse service containers with the API, a worker per region and the pusher running. Pull requests also build all five images and scan them with Trivy (report only). |
| `.github/workflows/images.yml` | called by the two above | Builds the five images with layer caching; on main, pushes them to Artifact Registry tagged with the commit SHA. |
| `.github/workflows/cd.yml` | every push to `main` | CI, then the images, then commits the new tags to `uptime-watch-deploy`. Argo CD in the cluster does the rollout; this repo never holds cluster credentials. Deploys run one at a time. |

Signing in to Google Cloud uses Workload Identity Federation (GitHub's OIDC
token), so no service-account key is stored anywhere. The repository
variables and the deploy key `cd.yml` needs, and the commands that create
them, are in the deploy repo's README. Third-party actions are pinned to
commit SHAs.

## Tests

Two suites, both against the local containers:

```sh
cd packages/timeseries && bun test     # ClickHouse queries and retention, under 1 s
cd apps/tests && bun test              # the API, about 2.5 min with the slow tests
```

`apps/tests` needs a running API (`./start.sh`), at `http://localhost:3000`
unless `BACKEND_URL` says otherwise. Two files are slow: `pipeline.test.ts`
also needs the pusher and one worker per region, and waits for a new
website's first check from every region; `website-cap.test.ts` fills an
account to its 20 websites, which the 10-a-minute limit stretches to about a
minute. Skip both with `SKIP_SLOW=1 bun test` (about 4 s), or run one file
with `bun test auth`.

| File | What it covers |
|---|---|
| `packages/timeseries/aggregates.test.ts` | Chart windows, the conditional TTL (on a scratch table), the hourly summary matching the individual checks, daily uptime, latest checks, and how incidents start, end, split and merge across regions. Writes checks for made-up `test-…` website ids and deletes them afterwards. |
| `user.test.ts`, `auth.test.ts` | Sign-up and sign-in, the username and password rules, taken usernames, the same answer for a wrong password and an unknown user, forged, missing, expired and non-expiring tokens, the sign-in rate limit (429 with `Retry-After`). The expiry tests sign their own tokens with `JWT_SECRET` (or the one in `apps/api/.env`) and are skipped without it. |
| `website.test.ts`, `website-rules.test.ts`, `website-cap.test.ts` | Adding websites (only `http(s)`, at most 2048 characters, 429 when added too fast, 403 at 20 websites), one user can't see or change another's websites, renaming, pausing, chart parameter limits. |
| `website-detail.test.ts`, `dashboard.test.ts` | Site detail, chart buckets for every range, `/fleet` (1 h and 24 h only), regions, the check interval. |
| `status-page.test.ts` | Status-page addresses (format, one account each), only public websites shown, no owner details. |
| `service.test.ts` | `/health`, the OpenAPI spec and `/docs`, oversized and malformed request bodies. |
| `pipeline.test.ts` | End to end: pusher, Redis stream, a worker in every region, ClickHouse, the hourly summary, and that paused websites aren't checked. |

Rate limits count per client address, so each test file sends its own address
from `198.18.0.0/15` in `X-Forwarded-For` (`helpers.ts`, and `setup.ts` for
plain `axios` calls). The API trusts that header only from local and private
addresses, so this works locally; against a deployed API behind an ingress
the real address is used. Tests create users named `test-…` (or `0.…` from the
original tests). Every test deletes the websites it adds.

### packages added
```
bun add zod 
bun add jsonwebtoken @types/jsonwebtoken
```
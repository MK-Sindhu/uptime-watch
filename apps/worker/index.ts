// import { xAckBulk, xReadGroup,  } from "redisstream/client";
import { closeRedis, ensureConsumerGroup, xAckBulk, xAutoClaim, xReadGroup } from "redisstream/client";
import axios from "axios";
// import { db } from "store";
// Check results go to ClickHouse; the worker no longer talks to Postgres.
import { closeTimeseries, ensureSchema, insertTicks, type NewTick } from "timeseries";

const REGION_ID = process.env.REGION_ID!;
// const WORKER_ID = process.env.WORKER_ID!;
// In Kubernetes every pod has a unique HOSTNAME, so each replica becomes its
// own consumer without extra config. WORKER_ID still wins when set (local dev).
const WORKER_ID = process.env.WORKER_ID ?? process.env.HOSTNAME!;

// How long one check may take before the site counts as down.
const CHECK_TIMEOUT_MS = 10_000;
// Some sites (e.g. Wikipedia) reject requests with a generic library user agent.
const USER_AGENT = "UptimeWatch/1.0 (+https://github.com/MK-Sindhu/uptime-watch)";

if (!REGION_ID) {
    throw new Error("Region not provided")
}

if (!WORKER_ID) {
    // throw new Error("Region not provided")
    throw new Error("Worker not provided")
}

// Prisma 8 client is lazy: connect once before the first query
// await db.connect();
// Create the ClickHouse table on a fresh cluster.
await ensureSchema();
// A fresh Redis (new cluster, new region) has no consumer group yet.
await ensureConsumerGroup(REGION_ID);

// Kubernetes sends SIGTERM before stopping a pod: finish the current batch,
// ack it, then exit, so no check is half-done.
let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

async function main() {
    // while(1) {
    while (!stopping) {
        // Read from the stream
        // const response = await xReadGroup(REGION_ID, WORKER_ID);
        // Messages a dead worker never acked come first, then new ones.
        // xReadGroup waits up to 5 s when the stream is empty.
        const reclaimed = await xAutoClaim(REGION_ID, WORKER_ID);
        const response = reclaimed.length > 0 ? reclaimed : await xReadGroup(REGION_ID, WORKER_ID);

        // if (!response) {
        if (!response || response.length === 0) {
            continue;
        }

        // process the website and store the result in DB. TODO: It should probably
        // be routed through a queue in the bulk DB request
        let promises = response.map(({message}) => fetchWebsite(message.url, message.id))
        // await Promise.all(promises);
        const ticks = await Promise.all(promises);
        console.log(promises.length);

        // Save the whole batch in one insert. If that fails, don't ack: the
        // messages stay pending and are re-claimed and re-checked after 60 s.
        try {
            await insertTicks(ticks);
        } catch (e) {
            console.error("could not save checks, leaving them pending:", e);
            continue;
        }

        // ack back to the queue that this event has been processed

        await xAckBulk(REGION_ID, response.map(({id}) => id));
    }

    await closeRedis();
    // await db.close();
    await closeTimeseries();
    console.log("worker stopped");
    process.exit(0);
}

// async function fetchWebsite(url: string, websiteId: string) {
//     return new Promise<void>((resolve, reject) => {
//                 const startTime = Date.now();
//                 axios.get(url)
//                     .then(async () => {
//                         const endTime = Date.now();
//                         // await db.orm.public.website_tick.create({
//                         //     data: {
//                         //         response_time_ms: endTime - startTime,
//                         //         status: "Up",
//                         //         region_id: REGION_ID,
//                         //         website_id: websiteId
//                         //     }
//                         //
//                         // })
//                         await db.orm.public.website_tick.create({
//                             response_time_ms: endTime - startTime,
//                             status: "Up",
//                             region_id: REGION_ID,
//                             website_id: websiteId
//                         })
//                         resolve()
//                     })
//                     .catch(async () => {
//                         const endTime = Date.now();
//                         // await db.orm.public.website_tick.create({
//                         //     data: {
//                         //         response_time_ms: endTime - startTime,
//                         //         status: "Down",
//                         //         region_id: REGION_ID,
//                         //         website_id: websiteId
//                         //     }
//                         //
//                         // })
//                         await db.orm.public.website_tick.create({
//                             response_time_ms: endTime - startTime,
//                             status: "Down",
//                             region_id: REGION_ID,
//                             website_id: websiteId
//                         })
//                         resolve()
//                     })
//             })
//
// }

// Never rejects: a failed check is recorded as Down, so one bad message can't
// stall Promise.all and the whole worker. Saving happens per batch in main().
async function fetchWebsite(url: string, websiteId: string): Promise<NewTick> {
    const startTime = Date.now();
    let status: "Up" | "Down";
    try {
        await axios.get(url, {
            timeout: CHECK_TIMEOUT_MS,
            headers: { "User-Agent": USER_AGENT },
            // Up = the site answered with 2xx/3xx (redirects are followed).
            // Down = 4xx/5xx, a timeout, or no answer at all (DNS, refused, TLS).
            validateStatus: (status) => status < 400,
        });
        status = "Up";
    } catch {
        status = "Down";
    }
    const endTime = Date.now();

    // try {
    //     await db.orm.public.website_tick.create({
    //         response_time_ms: endTime - startTime,
    //         status,
    //         region_id: REGION_ID,
    //         website_id: websiteId
    //     })
    // } catch (e) {
    //     // e.g. the website was deleted while its check was still queued
    //     console.error(`could not save check for website ${websiteId}:`, e);
    // }
    return {
        website_id: websiteId,
        region_id: REGION_ID,
        status,
        response_time_ms: endTime - startTime,
        created_at: new Date(startTime),
    };
}

main()

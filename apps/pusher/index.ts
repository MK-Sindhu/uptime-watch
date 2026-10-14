import { db } from "store";
// import { xAddBulk } from "redisstream/client";
import { closeRedis, xAddBulk } from "redisstream/client";

// Run exactly ONE pusher (Kubernetes: replicas: 1). Every pusher queues every
// website, so two pushers mean every site is checked twice.

async function main() {
    // let websites = db.orm.public.website.findMany({
    //     select: {
    //         url: true,
    //         id: true
    //     }
    // })
    // let websites = await db.orm.public.website.select("url", "id").all();
    // Paused sites stay in Postgres but are never queued.
    let websites = await db.orm.public.website.where({ paused: false }).select("url", "id").all();
    await xAddBulk(websites.map(w => ({
        url: w.url,
        id: w.id
    })))
}

// setInterval(() => {
//     main()
// }, 3 * 1000 * 60)
// setInterval(() => {
//     main()
// }, 10 * 1000)
// A failed round (DB or Redis briefly unreachable) is logged and retried on
// the next tick instead of crashing the process with an unhandled rejection.
// const timer = setInterval(() => {
//     main().catch((e) => console.error("push round failed:", e))
// }, 10 * 1000)
// How often every site is checked. Must match CHECK_INTERVAL_SECONDS in
// packages/timeseries (same env var, same default), which uses it to tell
// one outage from the next.
const CHECK_INTERVAL_SECONDS = Number(process.env.CHECK_INTERVAL_SECONDS) || 30
const timer = setInterval(() => {
    main().catch((e) => console.error("push round failed:", e))
}, CHECK_INTERVAL_SECONDS * 1000)

// Kubernetes sends SIGTERM before stopping a pod.
async function shutdown() {
    clearInterval(timer);
    await closeRedis();
    await db.close();
    console.log("pusher stopped");
    process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

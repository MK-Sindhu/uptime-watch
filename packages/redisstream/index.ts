import { createClient } from "redis";

// const client = await createClient()
//     .on("error", (err) => console.log("Redis Client Error"))
//     .connect();
// REDIS_URL comes from the environment (in Kubernetes, a ConfigMap or Secret);
// falls back to the local Docker Redis for development.
const client = await createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" })
    .on("error", (err) => console.log("Redis Client Error", err))
    .connect();

const STREAM_NAME = "uptime-watch:website";
// Keep roughly the newest 10k messages; without a cap the stream grows forever.
const STREAM_MAX_LEN = 10_000;
// How long a read waits for new messages before returning nothing.
const BLOCK_MS = 5_000;
// A message delivered this long ago and still not acked belongs to a worker
// that died (e.g. its pod was killed), so another worker may claim it.
const RECLAIM_IDLE_MS = 60_000;

type WebsiteEvent =  {url: string, id: string}
type MessageType = {
    id: string,
    message: {
        url: string
        id: string
    }
}

async function xADD({url, id}: WebsiteEvent) {
    // await client.xAdd(
    //     STREAM_NAME, '*', {
    //         url,
    //         id
    //     }
    // );
    await client.xAdd(
        STREAM_NAME, '*', {
            url,
            id
        }, {
            TRIM: { strategy: 'MAXLEN', strategyModifier: '~', threshold: STREAM_MAX_LEN }
        }
    );
}

export async function xAddBulk(websites: WebsiteEvent[]) {
    for (let i = 0; i < websites.length; i++) {
        await xADD({
            url: websites[i]!.url,
            id: websites[i]!.id
        })
    }
}

// Create the region's consumer group if it doesn't exist yet, so a fresh Redis
// (or a new region) works without a manual XGROUP CREATE.
export async function ensureConsumerGroup(consumerGroup: string) {
    try {
        await client.xGroupCreate(STREAM_NAME, consumerGroup, '$', { MKSTREAM: true });
    } catch (e) {
        if (!(e instanceof Error && e.message.includes("BUSYGROUP"))) throw e;
    }
}

export async function xReadGroup(consumerGroup: string, workerId: string): Promise<MessageType[] | undefined> {

    // const res = await client.xReadGroup(
    //     consumerGroup, workerId, {
    //         key: STREAM_NAME,
    //         id: '>'
    //     }, {
    //         'COUNT': 5
    //     }
    // );
    // BLOCK: wait up to 5 s for new messages instead of returning at once,
    // so an idle worker doesn't spin in a tight loop.
    const res = await client.xReadGroup(
        consumerGroup, workerId, {
            key: STREAM_NAME,
            id: '>'
        }, {
            'COUNT': 5,
            'BLOCK': BLOCK_MS
        }
    );
    //@ts-ignore
    let messages: MessageType[] | undefined = res?.[0]?.messages;
    return messages;
}

// Take over messages that another worker read but never acked within
// RECLAIM_IDLE_MS (its pod crashed or was killed mid-batch).
export async function xAutoClaim(consumerGroup: string, workerId: string): Promise<MessageType[]> {
    const res = await client.xAutoClaim(
        STREAM_NAME, consumerGroup, workerId, RECLAIM_IDLE_MS, '0-0', { COUNT: 5 }
    );
    return res.messages.filter((m) => m !== null) as unknown as MessageType[];
}

async function xAck(consumerGroup: string, eventId: string) {
    await client.xAck(STREAM_NAME, consumerGroup, eventId)
}

// export async function xAckBulk(consumerGroup: string, eventIds: string[]) {
//     eventIds.map(eventId => xAck(consumerGroup, eventId));
// }
// One XACK for the whole batch, awaited so a failure isn't silently lost.
export async function xAckBulk(consumerGroup: string, eventIds: string[]) {
    if (eventIds.length === 0) return;
    await client.xAck(STREAM_NAME, consumerGroup, eventIds);
}

// Wait for pending commands, then close the connection (used on shutdown).
export async function closeRedis() {
    await client.close();
}

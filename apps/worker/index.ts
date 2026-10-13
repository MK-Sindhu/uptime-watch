import { xAckBulk, xReadGroup,  } from "redisstream/client";
import axios from "axios";
import { db } from "store";

const REGION_ID = process.env.REGION_ID!;
const WORKER_ID = process.env.WORKER_ID!;

if (!REGION_ID) {
    throw new Error("Region not provided")
}

if (!WORKER_ID) {
    // throw new Error("Region not provided")
    throw new Error("Worker not provided")
}

// Prisma 8 client is lazy: connect once before the first query
await db.connect();

async function main() {
    while(1) {
        // Read from the stream
        const response = await xReadGroup(REGION_ID, WORKER_ID); 

        if (!response) {
            continue;
        }

        // process the website and store the result in DB. TODO: It should probably
        // be routed through a queue in the bulk DB request
        let promises = response.map(({message}) => fetchWebsite(message.url, message.id))
        await Promise.all(promises);
        console.log(promises.length);

        // ack back to the queue that this event has been processed

        await xAckBulk(REGION_ID, response.map(({id}) => id));
    }
} 

async function fetchWebsite(url: string, websiteId: string) {
    return new Promise<void>((resolve, reject) => {
                const startTime = Date.now();
                axios.get(url)
                    .then(async () => {
                        const endTime = Date.now();
                        // await db.orm.public.website_tick.create({
                        //     data: {
                        //         response_time_ms: endTime - startTime,
                        //         status: "Up",
                        //         region_id: REGION_ID,
                        //         website_id: websiteId
                        //     }
                        //
                        // })
                        await db.orm.public.website_tick.create({
                            response_time_ms: endTime - startTime,
                            status: "Up",
                            region_id: REGION_ID,
                            website_id: websiteId
                        })
                        resolve()
                    })
                    .catch(async () => {
                        const endTime = Date.now();
                        // await db.orm.public.website_tick.create({
                        //     data: {
                        //         response_time_ms: endTime - startTime,
                        //         status: "Down",
                        //         region_id: REGION_ID,
                        //         website_id: websiteId
                        //     }
                        //
                        // })
                        await db.orm.public.website_tick.create({
                            response_time_ms: endTime - startTime,
                            status: "Down",
                            region_id: REGION_ID,
                            website_id: websiteId
                        })
                        resolve()
                    })
            })

}

main()
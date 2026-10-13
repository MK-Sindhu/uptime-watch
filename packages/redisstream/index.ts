import { createClient } from "redis";

const client = await createClient()
    .on("error", (err) => console.log("Redis Client Error"))
    .connect();

const STREAM_NAME = "uptime-watch:website";

type WebsiteEvent =  {url: string, id: string}
type MessageType = {
    id: string,
    message: {
        url: string
        id: string
    }
}

async function xADD({url, id}: WebsiteEvent) {
    await client.xAdd(
        STREAM_NAME, '*', {
            url,
            id
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

export async function xReadGroup(consumerGroup: string, workerId: string): Promise<MessageType[] | undefined> {
    
    const res = await client.xReadGroup(
        consumerGroup, workerId, {
            key: STREAM_NAME,
            id: '>'
        }, {
            'COUNT': 5
        }
    );
    //@ts-ignore
    let messages: MessageType[] | undefined = res?.[0]?.messages;
    return messages;
}

async function xAck(consumerGroup: string, eventId: string) {
    await client.xAck(STREAM_NAME, consumerGroup, eventId)
}

export async function xAckBulk(consumerGroup: string, eventIds: string[]) {
    eventIds.map(eventId => xAck(consumerGroup, eventId));
}
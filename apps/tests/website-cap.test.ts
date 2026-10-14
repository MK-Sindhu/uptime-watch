// The most websites one account can watch (MAX_WEBSITES_PER_USER, 20 by
// default). Adding is limited to 10 a minute, so filling an account takes
// about a minute; skip it with SKIP_SLOW=1.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { auth, testClient } from "./helpers";

const { http, signUp } = testClient();

describe.skipIf(process.env.SKIP_SLOW === "1")("Websites per account", () => {
    let jwt: string;
    const created: string[] = [];

    beforeAll(async () => {
        ({ jwt } = await signUp());
    });

    afterAll(async () => {
        for (const id of created) await http.delete(`/websites/${id}`, auth(jwt));
    });

    it("stops at the cap with a 403 that says so", async () => {
        let full: { status: number; data: { message: string } } | undefined;
        while (!full && created.length < 500) {
            // The discard port on this machine: refused at once, so the
            // workers don't send real traffic anywhere while the account fills.
            const res = await http.post("/website", { url: `http://127.0.0.1:9/cap-test/${created.length}` }, auth(jwt));
            if (res.status === 200) created.push(res.data.id);
            else if (res.status === 429) await Bun.sleep((Number(res.headers["retry-after"]) + 1) * 1000);
            else full = res;
        }

        expect(full?.status).toBe(403);
        const cap = Number(full?.data.message.match(/at most (\d+) websites/)?.[1]);
        expect(created.length).toBe(cap);
        const listed = (await http.get("/websites", auth(jwt))).data.websites;
        expect(listed).toHaveLength(cap);

        // At the cap, the answer stays 403 however fast you ask: it comes
        // before the add-website rate limit.
        for (let i = 0; i < 3; i++) {
            expect((await http.post("/website", { url: "http://127.0.0.1:9/one-more" }, auth(jwt))).status).toBe(403);
        }
    }, 180_000);
});

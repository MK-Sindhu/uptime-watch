// import { beforeAll, describe, expect, it } from "bun:test";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import axios from "axios";
import { createUser } from "./testUtils";
import { BACKEND_URL } from "./config";

// Don't throw on 4xx so a test can assert the status code.
const http = axios.create({ baseURL: BACKEND_URL, validateStatus: () => true });


describe("Website gets created", () => {
    
    let token: string;
    // Websites this group adds, deleted at the end: the workers would
    // otherwise keep checking them every round.
    const created: string[] = [];

    beforeAll(async () => {
        const data = await createUser();
        token = data.jwt;
    })

    afterAll(async () => {
        for (const id of created) await http.delete(`/websites/${id}`, { headers: { Authorization: token } });
    })

    it("Website not created if url is not present", async () => {
        // try {
        // await axios.post(`${BACKEND_URL}/website`, {
        // }, {
        //     headers: {
        //         Authorization: token
        //     }
        // });
        // expect(false, "Website created when it shouldn't");
        // } catch (e) {
        //
        // }
        // expect(false, "...") has no matcher, so it never fails, and the catch
        // would swallow a failure anyway. Check the status code instead.
        const response = await http.post("/website", {
        }, {
            headers: {
                Authorization: token
            }
        });
        expect(response.status).toBe(411);
    });
    it("Website is created if url is present", async () => {
        const response = await axios.post(`${BACKEND_URL}/website`, {
            url: "https://google.com"
        }, {
            headers: {
                Authorization: token
            }
        });
        // expect(response.data.id).not.toBeNull();
        // A missing id is undefined, which .not.toBeNull() lets through.
        expect(response.data.id).toBeString();
        created.push(response.data.id);
        })
    
    it("Website is not created if header is not present", async () => {
        // try {
        //     const response = await axios.post(`${BACKEND_URL}/website`, {
        //         url: "https://google.com"
        //     });
        //     expect(false, "Website shouldn't be created if no auth header");
        // } catch(e) {
        //
        // }
        const response = await http.post("/website", {
            url: "https://google.com"
        });
        expect(response.status).toBe(403);
    })
});

describe("Can fetch website", () => {
    let token1: string, userId1: string;
    let token2: string, userId2: string;

    beforeAll(async () => {
        const user1 = await createUser();
        const user2 = await createUser();
        token1 = user1.jwt;
        token2 = user2.jwt;
        userId1 = user1.id;
        userId2 = user2.id;
    })

    // Both tests add a website as user 1; delete them at the end.
    const created: string[] = [];
    afterAll(async () => {
        for (const id of created) await http.delete(`/websites/${id}`, { headers: { Authorization: token1 } });
    })

    it("Is able to fetch a website that the user created", async () => {
        const websiteResponse = await axios.post(`${BACKEND_URL}/website`, {
            url: "https://ajsdnfkjanfubaksafk.com/"
        }, {
            headers: {
                Authorization: token1
            }
        });
        created.push(websiteResponse.data.id);

        const getWebsiteResponse = await axios.get(`${BACKEND_URL}/status/${websiteResponse.data.id}`, {
            headers: {
                Authorization: token1
            }
        })

        expect(getWebsiteResponse.data.id).toBe(websiteResponse.data.id)
        expect(getWebsiteResponse.data.user_id).toBe(userId1)
    })

    it("Can't access websote created by other user", async () => {
        const websiteResponse = await axios.post(`${BACKEND_URL}/website`, {
            url: "https://ajsdnfkjanfubaksafk.com/"
        }, {
            headers: {
                Authorization: token1
            }
        });
        created.push(websiteResponse.data.id);

        // try {
        //         await axios.get(`${BACKEND_URL}/status/${websiteResponse.data.id}`, {
        //             headers: {
        //                 Authorization: token1
        //         }
        //     })
        //     expect(false, "Shouldn't be able to access website of a different user")
        // } catch(e) {
        //
        // }
        // The old version asked as the owner (token1), so it never tested
        // another user. Ask as user 2, who must not get the website back.
        const response = await http.get(`/status/${websiteResponse.data.id}`, {
            headers: {
                Authorization: token2
            }
        })
        expect(response.status).toBe(409)
        expect(response.data.url).toBeUndefined()
    })
});

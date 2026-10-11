import { beforeAll, describe, expect, it } from "bun:test";
import axios from "axios";
import { createUser } from "./testUtils";
import { BACKEND_URL } from "./config";


describe("Website gets created", () => {
    
    let token: string;

    beforeAll(async () => {
        const data = await createUser();
        token = data.jwt;
    })

    it("Website not created if url is not present", async () => {
        try {
        await axios.post(`${BACKEND_URL}/website`, {
        }, {
            headers: {
                Authorization: token
            }
        });
        expect(false, "Website created when it shouldn't");
        } catch (e) {

        }

    });
    it("Website is created if url is present", async () => {
        const response = await axios.post(`${BACKEND_URL}/website`, {
            url: "https://google.com"
        }, {
            headers: {
                Authorization: token
            }
        });
        expect(response.data.id).not.toBeNull();
        })
    
    it("Website is not created if header is not present", async () => {
        try {
            const response = await axios.post(`${BACKEND_URL}/website`, {
                url: "https://google.com"
            });
            expect(false, "Website shouldn't be created if no auth header");  
        } catch(e) {
        
        }
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

    it("Is able to fetch a website that the user created", async () => {
        const websiteResponse = await axios.post(`${BACKEND_URL}/website`, {
            url: "https://google.com"
        }, {
            headers: {
                Authorization: token1
            }
        });

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
            url: "https://google.com"
        }, {
            headers: {
                Authorization: token1
            }
        });

        try {
                await axios.get(`${BACKEND_URL}/status/${websiteResponse.data.id}`, {
                    headers: {
                        Authorization: token1
                }
            })
            expect(false, "Shouldn't be able to access website of a different user")
        } catch(e) {

        }

    })
});

import axios from "axios";
import { describe, expect, it } from "bun:test";
import { BACKEND_URL } from "./config";

const USER_NAME = Math.random().toString();
const PASSWORD = "password";

// Don't throw on 4xx so we can assert on the status code.
const http = axios.create({ baseURL: BACKEND_URL, validateStatus: () => true });

describe("Signup endpoints", () => {
    it("Isn't able to signup if body is incorrect", async () => {
        // try{
        //     await axios.post(`${BACKEND_URL}/user/signup`, {
        //         email: USER_NAME,
        //         password: PASSWORD,
        //     });
        //     expect(false, "Control shouldn't reach here")
        // } catch(e) {
        //     console.log(e)
        // }
        // expect(false, "...") has no matcher, so it never fails, and the catch
        // would swallow a failure anyway. Check the status code instead.
        const res = await http.post("/user/signup", {
            email: USER_NAME,
            password: PASSWORD,
        });
        expect(res.status).toBe(403);
    })

    it("Is able to signup if body is correct", async () => {
            const res = await axios.post(`${BACKEND_URL}/user/signup`, {
                username: USER_NAME,
                password: PASSWORD,
        })  
        expect(res.status).toBe(200);
        expect(res.data.id).toBeDefined(); 
    })

})

describe("Signin endpoints", () => {
    it("Isn't able to sign in if body is incorrect", async () => {
        // try{
        //     await axios.post(`${BACKEND_URL}/user/signin`, {
        //         email: USER_NAME,
        //         password: PASSWORD,
        //     });
        //     expect(false, "Control shouldn't reach here")
        // } catch(e) {
        //     console.log(e)
        // }
        const res = await http.post("/user/signin", {
            email: USER_NAME,
            password: PASSWORD,
        });
        expect(res.status).toBe(403);
    })

    it("Is able to sign in if body is correct", async () => {
            const res = await axios.post(`${BACKEND_URL}/user/signin`, {
                username: USER_NAME,
                password: PASSWORD,
        })  
        expect(res.status).toBe(200);
        expect(res.data.jwt).toBeDefined();
    })
})

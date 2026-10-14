import axios from "axios";
import { BACKEND_URL } from "./config";

// An HTTP client for one test file. It never throws on 4xx/5xx, so tests can
// assert the status code.
//
// Rate limits count per client address. Each client sends its own address in
// X-Forwarded-For, from 198.18.0.0/15 (reserved for network tests). The API
// trusts that header only from loopback and private addresses (TRUST_PROXY),
// so locally every test file gets its own buckets and repeated runs don't hit
// the sign-in limit. Behind a real ingress the header is ignored and the
// real address is used.
export function randomTestAddress() {
    return `198.18.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 254)}`;
}

export function testClient() {
    const ip = randomTestAddress();
    const http = axios.create({
        baseURL: BACKEND_URL,
        validateStatus: () => true,
        headers: { "X-Forwarded-For": ip },
    });

    async function signUp() {
        const username = `test-${crypto.randomUUID()}`;
        const password = "test-password";
        const signup = await http.post("/user/signup", { username, password });
        if (signup.status !== 200) throw new Error(`sign-up failed: ${signup.status}`);
        const signin = await http.post("/user/signin", { username, password });
        if (signin.status !== 200) throw new Error(`sign-in failed: ${signin.status}`);
        return { id: signup.data.id as string, jwt: signin.data.jwt as string, username, password };
    }

    return { http, ip, signUp };
}

export const auth = (jwt: string) => ({ headers: { Authorization: jwt } });

// Polls `check` until it returns a value, or fails after `timeoutMs`.
export async function waitFor<T>(what: string, check: () => Promise<T | undefined>, timeoutMs: number, everyMs = 2000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const value = await check();
        if (value !== undefined) return value;
        await Bun.sleep(everyMs);
    }
    throw new Error(`Timed out after ${timeoutMs / 1000} s waiting for ${what}`);
}

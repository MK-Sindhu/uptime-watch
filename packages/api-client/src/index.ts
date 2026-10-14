// Typed client for the Uptime Watch API, generated from apps/api/openapi.json
// by @hey-api/openapi-ts (config: openapi-ts.config.ts). Everything under
// ./generated is overwritten by `bun run generate`; don't edit it by hand.

import { createClient, createConfig } from "./generated/client";
import { client } from "./generated/client.gen";

export * from "./generated";
export { client };

// A separate client for server-side calls (e.g. a Next.js server component
// fetching a public status page straight from the API by its full URL).
export function createServerApiClient(baseUrl: string) {
    return createClient(createConfig({ baseUrl }));
}

// Point the generated functions at an API and tell them where the JWT is.
// The API expects the raw token in the Authorization header (no "Bearer ").
export function configureApiClient(options: {
    baseUrl: string;
    getToken?: () => string | undefined;
}) {
    client.setConfig({
        baseUrl: options.baseUrl,
        auth: () => options.getToken?.(),
    });
}

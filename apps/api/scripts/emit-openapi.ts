// Writes the OpenAPI spec to apps/api/openapi.json. Run with `bun run openapi`.
// packages/api-client generates its typed client from that file.
import { buildOpenApiDocument } from "../openapi";

const path = new URL("../openapi.json", import.meta.url).pathname;
await Bun.write(path, JSON.stringify(buildOpenApiDocument(), null, 2) + "\n");
console.log(`wrote ${path}`);

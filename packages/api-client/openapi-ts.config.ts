import { defineConfig } from "@hey-api/openapi-ts";

// Generates src/generated from the API's OpenAPI spec. Don't edit the output;
// change apps/api/openapi.ts and run `bun run generate` here instead.
export default defineConfig({
  input: "../../apps/api/openapi.json",
  output: "src/generated",
  plugins: ["@hey-api/client-fetch", "@hey-api/typescript", "@hey-api/sdk"],
});

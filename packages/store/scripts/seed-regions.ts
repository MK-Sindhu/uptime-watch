// Makes sure every region in REGIONS (default "region1,region2") has a row.
// New rows use the name as their id, so a worker's REGION_ID is simply the
// region's name. Existing rows (matched by name) are left alone, so this is
// safe to run on every deploy.
//
//   cd packages/store && bun scripts/seed-regions.ts
//   REGIONS=region1,region2,region3 bun scripts/seed-regions.ts
import { db } from "../index";

const names = (process.env.REGIONS ?? "region1,region2")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

await db.connect();
for (const name of names) {
    const existing = await db.orm.public.region.where({ name }).first();
    if (existing) {
        console.log(`✓ region ${name} (id ${existing.id})`);
        continue;
    }
    await db.orm.public.region.create({ id: name, name });
    console.log(`+ region ${name} (id ${name})`);
}
await db.close();

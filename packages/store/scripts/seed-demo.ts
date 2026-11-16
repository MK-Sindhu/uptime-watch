// TEMP: demo account for showing the app (e.g. the Vercel preview).
// Creates user `demo` / `demo1234` with a public status page at /status/demo
// (the landing page links there) and a few public sites. Safe to re-run:
// the password and status page are reset, and sites are only added if the
// account has none. Run it against the database the deployed API uses:
//
//   cd packages/store && bun scripts/seed-demo.ts
//   DATABASE_URL=postgresql://... bun scripts/seed-demo.ts
//   DEMO_USERNAME=guest DEMO_PASSWORD=something-long bun scripts/seed-demo.ts
import { db } from "../index";

const username = process.env.DEMO_USERNAME ?? "demo";
const password = process.env.DEMO_PASSWORD ?? "demo1234";

const sites = [
    { url: "https://www.google.com", name: "Google" },
    { url: "https://github.com", name: "GitHub" },
    { url: "https://vercel.com", name: "Vercel" },
    { url: "https://www.wikipedia.org", name: "Wikipedia" },
];

await db.connect();

const account = {
    password: await Bun.password.hash(password),
    status_slug: "demo",
    status_title: "Demo status",
};

let user = await db.orm.public.user.where({ username }).first();
if (user) {
    user = (await db.orm.public.user.where({ id: user.id }).update(account))!;
    console.log(`✓ user ${username} (password reset)`);
} else {
    user = await db.orm.public.user.create({ username, ...account });
    console.log(`+ user ${username}`);
}

const existing = await db.orm.public.website.where({ user_id: user.id }).select("id").all();
if (existing.length === 0) {
    for (const site of sites) {
        await db.orm.public.website.create({
            ...site,
            public: true,
            time_added: Temporal.Now.instant(),
            user_id: user.id,
        });
        console.log(`+ site ${site.url}`);
    }
} else {
    console.log(`✓ ${existing.length} sites already added`);
}

console.log(`\nSign in with ${username} / ${password}. Status page: /status/demo`);
await db.close();

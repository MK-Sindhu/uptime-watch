import { z } from "zod";

export const AuthInput = z.object({
    username: z.string(),
    password: z.string()
})

// POST /user/signup. Sign-in keeps AuthInput, so accounts made before these
// rules can still sign in.
export const SignupInput = z.object({
    username: z.string()
        .min(3, "Usernames need at least 3 characters.")
        .max(64, "Usernames can be at most 64 characters.")
        .refine((u) => u === u.trim(), "Usernames can't start or end with a space."),
    password: z.string()
        .min(8, "Passwords need at least 8 characters.")
        .max(128, "Passwords can be at most 128 characters."),
})

// POST /website body. Only http(s) addresses can be checked (no file:, ftp:,
// javascript: ...), and the length cap stops one request storing a huge string.
export const WebsiteInput = z.object({
    url: z.url({ protocol: /^https?$/ }).max(2048)
})

// Time windows the detail page can show (see RANGES in packages/timeseries).
export const Range = z.enum(["1h", "24h", "7d", "30d", "90d"]);

// PATCH /websites/:id. An empty name clears it (the UI then shows the host).
export const WebsitePatch = z.object({
    name: z.string().trim().max(80).nullable().optional(),
    paused: z.boolean().optional(),
    public: z.boolean().optional(),
}).refine((o) => Object.keys(o).length > 0, { message: "Nothing to change." });

export const OverviewQuery = z.object({ range: Range.default("24h") });
export const SeriesQuery = z.object({ range: Range.default("24h"), region: z.string().max(64).optional() });
export const IncidentsQuery = z.object({
    range: Range.default("7d"),
    limit: z.coerce.number().int().min(1).max(200).default(50),
});
export const DailyQuery = z.object({
    days: z.coerce.number().int().min(7).max(90).default(90),
    tz: z.string().max(64).default("UTC"),
});

// Public status page address: /status/<slug>
export const StatusPagePatch = z.object({
    slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, "3-40 lowercase letters, digits or dashes").nullable().optional(),
    title: z.string().trim().max(80).nullable().optional(),
}).refine((o) => Object.keys(o).length > 0, { message: "Nothing to change." });
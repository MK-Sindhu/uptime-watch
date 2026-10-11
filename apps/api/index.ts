import jwt from "jsonwebtoken"
import express from "express"; 
const app = express();

import { db } from "store";
import { AuthInput } from "./types";
import { authMiddleware } from "./middleware";


await db.connect();

app.use(express.json());
 

app.post("/website",authMiddleware, async (req, res) => {
    if (!req.body.url) {
        res.status(411).json({});
        return
    }
    const website = await db.orm.public.website.create({
        url: req.body.url,
        time_added: Temporal.Now.instant(),
        user_id: req.userId!
    });
    res.json({
        id: website.id
    })
});

app.get("/status/:websiteId", authMiddleware, async (req, res) => {
    const website = await db.orm.public.website
        .where({ 
            id: req.params.websiteId as string,
            user_id: req.userId! 
        })
        .include("ticks", (ticks) =>
            ticks
                .orderBy((t) => t.createdAt.desc())
                .limit(1),
        )
        .first();

    if (!website) {
        res.status(409).json({
            message:"Not Found"
        })
        return;
    }
     res.json({
        url: website.url,
        id: website.id,
        user_id: website.user_id
     })
});

app.post("/user/signup", async (req, res) => {
    const data = AuthInput.safeParse(req.body);
    if (!data.success) {
        res.status(403).send("");
        return;
    }
    try {
        let user = await db.orm.public.user.create({
            username: data.data.username,
            password: data.data.password
        })
        res.json({
            id: user.id
        })

    } catch(e) {
        console.error("signup failed:", e);
        res.status(403).send("");
        return;
    }

})

app.post("/user/signin", async (req, res) => {
    const data = AuthInput.safeParse(req.body);
    if (!data.success) {
        res.status(403).send("");
        return;
    }
    let user = await db.orm.public.user.where({ username: data.data.username }).first()
    if (!user || user.password !== data.data.password) {
        res.status(403).send("");
        return;
    }
    let token = jwt.sign({
        sub: user.id
    }, process.env.JWT_SECRET!)

    res.json({
        jwt: token
    })
})

app.listen(process.env.PORT || 3000);
import express from "express"; 
const app = express();

import { db } from "store";

await db.connect();

app.use(express.json());

app.post("/website", async (req, res) => {
    if (!req.body.url) {
        res.status(411).json({});
        return
    }
    const website = await db.orm.public.Website.create({
        url: req.body.url,
        timeAdded: Temporal.Now.instant()
    });
    res.json({
        id: website.id
    })
});

app.get("/status/:websiteId", (req, res) => {

});

app.listen(process.env.PORT || 3000);
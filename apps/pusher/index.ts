import { db } from "store";
import { xAddBulk } from "redisstream/client";
 
async function main() {
    // let websites = db.orm.public.website.findMany({
    //     select: {
    //         url: true,
    //         id: true
    //     }
    // })
    let websites = await db.orm.public.website.select("url", "id").all();
    await xAddBulk(websites.map(w => ({
        url: w.url,
        id: w.id
    })))
}

// setInterval(() => {
//     main()
// }, 3 * 1000 * 60)
setInterval(() => {
    main()
}, 10 * 1000)
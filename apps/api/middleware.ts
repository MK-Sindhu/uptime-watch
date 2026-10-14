import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization!;
    try {
        let data = jwt.verify(header, process.env.JWT_SECRET!);
        // jwt.verify rejects expired tokens, but accepts tokens with no expiry
        // at all (signed before JWT_EXPIRES_IN existed). Refuse those too, so
        // every token in use runs out.
        if (typeof data === "string" || data.exp === undefined) {
            throw new Error("token has no expiry");
        }
        req.userId = data.sub as string;
        next();
    } catch(e) {
        res.status(403).send("");
    }
}
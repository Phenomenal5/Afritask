import type { NextFunction, Request, Response } from "express";
import type { IUser } from "../models/User.js";


// NOTE: roles are rest args — authorize("admin"), NOT authorize(["admin"])
export const authorize = (...allowedRoles: IUser["role"][]) => {
    return ( req: Request, res: Response, next: NextFunction) => {
        if(!req.user) return res.status(401).json({message: "Not authorized"})

        if(!allowedRoles.includes(req.user.role)) return res.status(403).json({message: "Insufficient permissions"})

        next()
    }
}

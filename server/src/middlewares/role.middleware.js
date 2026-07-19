import User from "../models/User.js";


export const authorize = (...allowedRoles) => {
    return ( req, res, next) => {
        if(!req.user) return res.status(401).json({message: "Not authorized"})
        
        if(!allowedRoles.includes(req.user.role)) return res.status(403).json({message: "Insufficient permissions"})
        
        next()
    }
}
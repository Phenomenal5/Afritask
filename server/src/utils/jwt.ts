import jwt, { type SignOptions } from "jsonwebtoken";
import type { UserDocument } from "../models/User.js";
import env from "../config/env.js";


const generateToken = (user: UserDocument) => {
    return jwt.sign(
        { id: user._id.toString() },
        env.jwtSecret,
        // JWT_EXPIRES_IN is an ms-style string like "7d"; the library types it as a template literal.
        { expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"] }
    );
};

export default generateToken;

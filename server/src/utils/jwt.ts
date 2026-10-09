import jwt, { type SignOptions } from "jsonwebtoken";
import type { PublicUser } from "../config/prisma.js";
import env from "../config/env.js";


const generateToken = (user: Pick<PublicUser, "id">) => {
    return jwt.sign(
        { id: user.id },
        env.jwtSecret,
        // JWT_EXPIRES_IN is an ms-style string like "7d"; the library types it as a template literal.
        { expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"] }
    );
};

export default generateToken;

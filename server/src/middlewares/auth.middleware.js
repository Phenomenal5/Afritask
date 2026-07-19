import jwt from "jsonwebtoken";
import User from "../models/User.js";
import logger from "../utils/logger.js";

const protect = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            logger.warn(`Unauthorized access attempt: missing or invalid auth header`);
            return res.status(401).json({ status: "fail", message: "Unauthorized" });
        }

        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Accept the current payload name and older tokens generated with userId.
        const userId = decoded.id || decoded.userId;

        if (!userId) {
            logger.warn(`Unauthorized access attempt: token missing userId`);
            return res.status(401).json({ status: "fail", message: "Unauthorized" });
        }

        const user = await User.findById(userId);
        if (!user) {
            logger.warn(`Unauthorized access attempt: user not found userId=${userId}`);
            return res.status(401).json({ status: "fail", message: "Unauthorized" });
        }

        req.user = user;
        next();
    } catch (error) {
        logger.error(`Authorization failure: ${error.stack || error.message || error}`);
        res.status(401).json({ status: "fail", message: "Unauthorized" });
    }
};

export default protect;

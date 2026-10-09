import mongoose from "mongoose"
import logger, { describeError } from "../utils/logger.js"
import env from "./env.js"

// connect database
const connectDB = async () => {
    try {
        const connect = await mongoose.connect(env.mongoUrl);
        logger.info(`MongoDB connected successfully ${connect.connection.host}`)
    } catch (error) {
        logger.error(describeError(error));
    process.exit(1); // Exit process with failure
    }
}



export default connectDB;

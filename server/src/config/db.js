import mongoose from "mongoose"
import logger from "../utils/logger.js"

// connect database
const connectDB = async () => {
    try {
        const connect = await mongoose.connect(process.env.MONGO_URL);
        logger.info(`MongoDB connected successfully ${connect.connection.host}`)
    } catch (error) {
        logger.error(error.stack || error.message || error);
    process.exit(1); // Exit process with failure
    }
}



export default connectDB;
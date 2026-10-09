// Redis connection options shared by BullMQ queues and workers.
// BullMQ builds its own ioredis client from the url, so we only pass options.

// Fail fast at boot: without Redis the reminder queue can't run.
if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL is not set — add it to server/.env (e.g. redis://localhost:6379)");
}

const redisConnection = { url: process.env.REDIS_URL };

export default redisConnection;

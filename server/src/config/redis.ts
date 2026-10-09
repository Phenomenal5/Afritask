// Redis connection options shared by BullMQ queues and workers.
// BullMQ builds its own ioredis client from the url, so we only pass options.
// REDIS_URL presence is enforced at boot by config/env.ts.
import env from "./env.js";

const redisConnection = { url: env.redisUrl };

export default redisConnection;

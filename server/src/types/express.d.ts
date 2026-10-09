// Passport types req.user as an empty Express.User — widen it to our public user
// so protected handlers get real fields (id, email, role…), never the secrets.
import type { PublicUser } from "../config/prisma.js";

declare global {
  namespace Express {
    interface User extends PublicUser {}
  }
}

export {};

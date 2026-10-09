// Passport types req.user as an empty Express.User — widen it to our user document
// so protected handlers get real fields (id, email, role…).
import type { UserDocument } from "../models/User.js";

declare global {
  namespace Express {
    interface User extends UserDocument {}
  }
}

export {};

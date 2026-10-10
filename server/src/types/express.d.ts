// Passport types req.user as an empty Express.User — widen it to our public user
// so protected handlers get real fields (id, email, role…), never the secrets.
import type { PublicUser } from "../config/prisma.js";
import type { Membership } from "../generated/prisma/client.js";

declare global {
  namespace Express {
    interface User extends PublicUser {}

    interface Request {
      // Id of the session `protect` authenticated — lets logout/password change target it.
      sessionId?: string;
      // The caller's ACTIVE membership in the workspace a route targets
      // (set by requireWorkspaceMember / task loaders).
      membership?: Membership;
      // The signed-in operator (admin console only), set by requireOperator.
      operator?: { userId: string; name: string; email: string; sessionId: string };
    }
  }
}

export {};

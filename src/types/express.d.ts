// src/types/express.d.ts
import { AuthenticatedUser } from "../middleware/AuthenticatedUser";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

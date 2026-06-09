import type { Request, Response, NextFunction } from "express";
import { getAuth, requireAuth } from "@clerk/express";
import type { RowDataPacket } from "mysql2/promise";
import _pool from "../config/database"; 

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execute = (sql: string, params: any[]) => (_pool as any).execute(sql, params);

export type AuthRequest = Request & {
  userId?: string; // local DB userID
};

interface UserRow extends RowDataPacket {
  userID: number; 
  clerkId: string;
}

export const protectRoute = [
  requireAuth(),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { userId: clerkId } = getAuth(req);

      const [rows] = await execute(
        "SELECT userID FROM Users WHERE clerkId = ? LIMIT 1",
        [clerkId]
      ) as [UserRow[], unknown];

      const user = rows[0];
      
      if (!user) {
         return res.status(404).json({ message: "User not found in local database" });
      }

      req.userId = user.userID.toString();

      next();
    } catch (error) {
      console.error("Auth middleware error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  },
];
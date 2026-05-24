import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../middleware/auth";
import _pool from "../config/database";
import { mapUser, type UserRow } from "../utils/mapUser";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execute = (sql: string, params: any[]) => (_pool as any).execute(sql, params);

export async function getUsers(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;

    const [rows] = await execute(
      "SELECT userID, userName, userEmail, profilePicture FROM Users WHERE userID != ? LIMIT 25",
      [userId]
    ) as [UserRow[], unknown];

    res.json(rows.map(mapUser));
  } catch (error) {
    res.status(500);
    next(error);
  }
}
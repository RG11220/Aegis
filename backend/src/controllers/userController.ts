import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../middleware/auth";
import _pool from "../config/database";
import type { RowDataPacket } from "mysql2/promise";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execute = (sql: string, params: any[]) => (_pool as any).execute(sql, params);

interface UserRow extends RowDataPacket {
  userID: number;
  userName: string;
  userEmail: string;
  profilePicture: string;
}

export async function getUsers(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;

    const [rows] = await execute(
      "SELECT userID, userName, userEmail, profilePicture FROM Users WHERE userID != ? LIMIT 25",
      [userId]
    ) as [UserRow[], unknown];

    res.json(rows);
  } catch (error) {
    res.status(500);
    next(error);
  }
}
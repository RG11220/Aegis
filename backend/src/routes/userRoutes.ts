import { Router } from "express";
import { getUsers } from "../controllers/userController";
import { protectRoute } from "../middleware/auth";

const router = Router();

router.get("/", protectRoute, getUsers);

export default router;
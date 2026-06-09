import { Router } from "express";
import { protectRoute } from "../middleware/auth";
import { getChats, getOrCreateChat, createGroupChat } from "../controllers/chatController";

const router = Router();

router.get("/", protectRoute, getChats);
router.post("/with/:participantId", protectRoute, getOrCreateChat);
router.post("/group", protectRoute, createGroupChat);

export default router;
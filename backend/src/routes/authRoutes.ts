import { Router } from "express";
import { authCallback, getMe, getCryptoKeys, registerKeys } from "../controllers/authController";
import { protectRoute } from "../middleware/auth";

const router = Router();

router.get("/me", protectRoute, getMe);
router.get("/crypto-keys", protectRoute, getCryptoKeys);
router.post("/register-keys", protectRoute, registerKeys);
router.post("/callback", authCallback);

export default router;
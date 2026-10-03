import { Router } from "express";
import { register } from "./auth.controller";
import { login } from "./auth.login.controller";
import { getMe } from "./auth.me.controller";
import { requireAuth } from "../../middleware/auth.middleware";


const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", requireAuth, getMe);


export default router;

import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { createOrganizationHandler } from "./organization.controller";
import { listOrganizationsHandler } from "./organization.list.controller";
import eventRoutes from "../events/event.routes";

const router = Router();

router.post("/", requireAuth, createOrganizationHandler);
router.get("/", requireAuth, listOrganizationsHandler);
router.use("/:organizationId/events", eventRoutes);
export default router;

import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { createEventHandler } from "./event.controller";
import { listOrganizationEventsHandler } from "./event.list.controller";
import {
  addEventMemberHandler,
  listEventMembersHandler,
  updateEventMemberHandler,
  removeEventMemberHandler,
} from "./event-member.controller";
import { createTransactionHandler } from "./transaction.controller";
import { listTransactionsHandler } from "./transaction.list.controller";
import { getWalletBalanceHandler } from "./wallet.balance.controller";
import { reverseTransactionHandler } from "./transaction.reversal.controller";
import { activateEventHandler } from "./event.status.controller";
import { listAuditLogsHandler } from "./audit-log.list.controller";

const router = Router({ mergeParams: true });

router.get("/", requireAuth, listOrganizationEventsHandler);
router.post("/", requireAuth, createEventHandler);

router.post(
  "/:eventId/members",
  requireAuth,
  addEventMemberHandler,
);

router.get(
  "/:eventId/members",
  requireAuth,
  listEventMembersHandler,
);

router.patch(
  "/:eventId/members/:memberId",
  requireAuth,
  updateEventMemberHandler,
);
router.delete(
  "/:eventId/members/:memberId",
  requireAuth,
  removeEventMemberHandler,
);
router.post(
  "/:eventId/transactions",
  requireAuth,
  createTransactionHandler,
);
router.get(
  "/:eventId/transactions",
  requireAuth,
  listTransactionsHandler,
);
router.get(
  "/:eventId/wallet",
  requireAuth,
  getWalletBalanceHandler,
);
router.post(
  "/:eventId/transactions/:transactionId/reverse",
  requireAuth,
  reverseTransactionHandler,
);
router.patch(
  "/:eventId/status",
  requireAuth,
  activateEventHandler,
);
router.get(
  "/:eventId/audit-logs",
  requireAuth,
  listAuditLogsHandler,
);
export default router;
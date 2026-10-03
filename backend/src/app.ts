
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { prisma } from "./config/prisma";
import authRoutes from "./modules/auth/auth.routes";
import organizationRoutes from "./modules/organizations/organization.routes";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use("/api/v1/organizations", organizationRoutes);
app.use("/api/v1/auth", authRoutes);

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      success: true,
      service: "EventVault API",
      status: "healthy",
      database: "connected",
    });
  } catch (error: unknown) {
    console.error("Health check database error:", error);

    res.status(503).json({
      success: false,
      service: "EventVault API",
      status: "unhealthy",
      database: "disconnected",
    });
  }
});

export default app;
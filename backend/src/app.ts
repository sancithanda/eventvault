import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    service: "EventVault API",
    status: "healthy",
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`EventVault API running on port ${PORT}`);
});
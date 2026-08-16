import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import workspaceRoutes from "./routes/workspaceRoutes.js" 
import { errorHandler } from "./utils/errorHandler.js";
export const app = express();

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/workspaces", workspaceRoutes);
app.use(errorHandler)
app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
});

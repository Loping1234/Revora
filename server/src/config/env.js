import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

export const env = {
  port: Number(process.env.PORT || 5000),
  nodeEnv: process.env.NODE_ENV || "development",
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/dp_di",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  apiKey: process.env.API_KEY || "",
  jwtSecret: process.env.JWT_SECRET || "local-demo-secret-change-before-deployment",
  auth: {
    adminPassword: process.env.AUTH_ADMIN_PASSWORD || "admin123",
    analystPassword: process.env.AUTH_ANALYST_PASSWORD || "analyst123",
    managerPassword: process.env.AUTH_MANAGER_PASSWORD || "manager123"
  }
};

import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGODB_URI || "", // blank → in-memory dev DB
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  webOrigin: process.env.WEB_ORIGIN || "http://localhost:5173",
  isProd: process.env.NODE_ENV === "production",
};

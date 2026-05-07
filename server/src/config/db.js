import mongoose from "mongoose";
import { env } from "./env.js";

const connectionStateMap = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting"
};

export function getDatabaseStatus() {
  const readyState = mongoose.connection.readyState;

  return {
    status: connectionStateMap[readyState] || "unknown",
    readyState,
    host: mongoose.connection.host || null,
    name: mongoose.connection.name || null
  };
}

export function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}

export function assertDatabaseConnected() {
  if (isDatabaseConnected()) return;

  const error = new Error("Database is not connected. Please start MongoDB and restart the backend server.");
  error.statusCode = 503;
  throw error;
}

export async function connectDatabase() {
  try {
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
    return true;
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`);
    return false;
  }
}

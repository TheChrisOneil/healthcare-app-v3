import dotenv from "dotenv";
import { startServer } from "./routes";
import { DiagnosisService } from "./diagnosis-service";

// Load environment variables
dotenv.config();

// Start server and services
startServer();
new DiagnosisService();
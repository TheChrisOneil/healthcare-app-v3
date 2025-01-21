import dotenv from "dotenv";
import { startApiServer } from "./routes";
import { DiagnosisService } from "./diagnosis-service";

// Load environment variables
dotenv.config();

// Start server and services
startApiServer();
new DiagnosisService();
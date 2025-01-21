import dotenv from "dotenv";
import { startApiServer } from "./api/routes";
import { TranscribeService } from "./transcription/transcribe-service";

// Load environment variables
dotenv.config();

// Start server and services
startApiServer();
new TranscribeService();
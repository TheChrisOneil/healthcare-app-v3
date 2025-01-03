import fs from "fs";
import path from "path";
import { TranscriptionChunk } from "../../../../shared-interfaces/src/transcription"; 

export const loadMockTranscriptionChunks = (): TranscriptionChunk[] => {
  const filePath = path.join(__dirname, "../mocks/mockTranscriptionChunk.json");
  const fileContent = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(fileContent) as TranscriptionChunk[];
};
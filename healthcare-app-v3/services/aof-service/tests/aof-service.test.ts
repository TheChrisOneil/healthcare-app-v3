import { loadMockTranscriptionChunks } from "./utils/loadMockData";
import { AOFService } from "../src/aof-service";
import { StringCodec } from "nats";
import logger from "../src/logger";
import { TranscriptionChunk } from "../../../shared-interfaces/src/transcription"; 
jest.mock("../src/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock("nats", () => ({
  StringCodec: jest.fn(() => ({
    encode: jest.fn((data: string) => Buffer.from(data)),
    decode: jest.fn((data: Buffer) => data.toString()),
  })),
}));

describe("AOFService Mock Data Tests", () => {
  let mockChunks: TranscriptionChunk[];

  beforeAll(() => {
    mockChunks = loadMockTranscriptionChunks();
  });

  it("should process mocked transcription chunks", () => {
    const service = new AOFService();
    const sc = StringCodec();

    mockChunks.forEach((chunk) => {
      service["processWord"](chunk.transcript);

      expect(logger.info).toHaveBeenCalledWith(`Processed word: **test**`);
      expect(logger.info).toHaveBeenCalledWith(`Processed word: **transcript**`);
    });
  });
});
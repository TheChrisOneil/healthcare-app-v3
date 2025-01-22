import { PassThrough, Readable } from "stream";
import { JsonEncodedAudioData } from "shared-interfaces/transcription";
import fs from "fs";

/**
   * Extracts the audio buffer from the JSON data, saves it and converts it to a Buffer.
   * The JSON data is expected to have a 'data' field containing the byte array.
   * The UX client sends the audio data in this format.
   * @param jsonData 
   * @returns Buffer containing the audio data.
   */
  export const parseAudioBuffer = (jsonData: JsonEncodedAudioData): Buffer => {
    const byteArray = jsonData.data; // Extract the byte array from JSON
    const buffer = Buffer.from(byteArray); // Convert the byte array to a Buffer
    return buffer;
  }

  /**
   * Provides a throttled stream to the Transcribe service.
   * The AWS Transcribe service requires a stream of audio chunks.
   * Manages the flow of audio data to the Transcribe service.
   * @param buffer 
   * @returns PassThrough stream for the audio data.
   */
  export const createAudioStream = (buffer: Buffer): PassThrough => {
    
    // Create a readable stream from the buffer
    const sourceStream = new Readable({
      read() {
        this.push(buffer);
        this.push(null); // End the stream
      },
    });

    // Add a PassThrough stream to control flow
    const throttledStream = new PassThrough({ highWaterMark: 4 * 1024 }); // 4KB chunks
    sourceStream.pipe(throttledStream);

    return throttledStream;
  }
/**
 * Convert PCM audio to a WAV file and save it.
 * @param pcmBuffer Buffer containing raw PCM audio data.
 * @param outputPath Path to save the WAV file.
 * @param sampleRate Sample rate of the audio (e.g., 16000 Hz).
 * @param numChannels Number of channels (e.g., 1 for mono).
 * @param bitDepth Bit depth of the PCM data (e.g., 16).
 */
export const savePcmToWavFile = (pcmBuffer: Buffer, outputPath: string,
     sampleRate: number, numChannels: number, bitDepth: number) => {
  // Calculate WAV header values
  const byteRate = (sampleRate * numChannels * bitDepth) / 8;
  const blockAlign = (numChannels * bitDepth) / 8;
  const wavHeader = Buffer.alloc(44);

  // Write WAV header
  wavHeader.write("RIFF", 0); // Chunk ID
  wavHeader.writeUInt32LE(36 + pcmBuffer.length, 4); // Chunk Size
  wavHeader.write("WAVE", 8); // Format
  wavHeader.write("fmt ", 12); // Subchunk1 ID
  wavHeader.writeUInt32LE(16, 16); // Subchunk1 Size
  wavHeader.writeUInt16LE(1, 20); // Audio Format (1 = PCM)
  wavHeader.writeUInt16LE(numChannels, 22); // Number of Channels
  wavHeader.writeUInt32LE(sampleRate, 24); // Sample Rate
  wavHeader.writeUInt32LE(byteRate, 28); // Byte Rate
  wavHeader.writeUInt16LE(blockAlign, 32); // Block Align
  wavHeader.writeUInt16LE(bitDepth, 34); // Bits Per Sample
  wavHeader.write("data", 36); // Subchunk2 ID
  wavHeader.writeUInt32LE(pcmBuffer.length, 40); // Subchunk2 Size

  // Combine the header and PCM data
  const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);

  // Save the WAV file
  fs.writeFileSync(outputPath, wavBuffer);
}
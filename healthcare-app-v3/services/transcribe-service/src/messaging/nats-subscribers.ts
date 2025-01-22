import { NatsConnection, JSONCodec, StringCodec } from "nats";
import logger from "../utils/logger";
import { TranscribeService } from "../transcription/transcribe-service";
import { AudioChunk, SessionInitiation } from "shared-interfaces/transcription"; // Using compiler options to manage local vs docker paths
import {
  createClient,
  RedisClientType,
  RedisModules,
  RedisFunctions,
  RedisScripts,
} from "redis";

/**
 * Define the type for the Redis client.
 * This includes extensions like Redis Graph if applicable.
 */
type CustomRedisClient = RedisClientType<
  RedisModules,
  RedisFunctions,
  RedisScripts
>;
const queueGroup = "transcribe-workers";

export async function subscribeToNatsMessages(
  natsClient: NatsConnection,
  redisClient: CustomRedisClient
) {
  const jc = JSONCodec();
  const sc = StringCodec();
  const queueGroup = "transcribe-workers";

  // Subscription: Handle audio chunks
  natsClient.subscribe("transcription.audio.chunks", {
    queue: queueGroup,
    callback: async (_err, msg) => {
      if (_err) {
        logger.error("Error receiving transcription start event:", _err);
        return;
      }

      try {
        const service = new TranscribeService(redisClient, natsClient);
        // Decode and parse the message
        const audioMessage: AudioChunk = jc.decode(msg.data) as AudioChunk;
        await service.processAudioChunk(audioMessage);
      } catch (error) {
        logger.error("Error processing audio chunk:", error);
      }
    },
  });

  /**
   * Subscription: transcription.session.started
   */
  natsClient.subscribe("command.transcribe.start", {
    queue: queueGroup,
    callback: (_err, msg) => {
      if (_err) {
        logger.error("Error receiving transcription started event:", _err);
        return;
      }

      try {
        // Decode and parse the message data
        const sessionData = jc.decode(msg.data) as SessionInitiation;

        // Validate the sessionData structure
        const {
          sessionId,
          patientDID,
          clinicianDID,
          clinicName,
          startTime,
          audioConfig,
          transcriptPreferences,
        } = sessionData;

        if (
          !sessionId ||
          !patientDID ||
          !clinicianDID ||
          !clinicName ||
          !startTime ||
          !audioConfig?.sampleRate ||
          !audioConfig?.channels ||
          !audioConfig?.encoding ||
          !transcriptPreferences?.language ||
          transcriptPreferences.autoHighlight === undefined ||
          transcriptPreferences.saveAudio === undefined
        ) {
          logger.error("Invalid session data received:", sessionData);
          return;
        }

        // Log the received session data
        logger.debug("Received transcription start event:", sessionData);
        // Start transcription with the full session data
        const service = new TranscribeService(redisClient, natsClient);
        service.startTranscription(sessionData);
      } catch (error) {
        logger.error("Error processing transcription start event:", error);
      }
    },
  });
  // Subscription: transcription.session.stopped
  natsClient.subscribe("command.transcribe.stop", {
    queue: queueGroup,
    callback: (_err, msg) => {
      if (_err) {
        logger.error("Error receiving transcription stopped event:", _err);
        return;
      }
      const data = jc.decode(msg.data) as { sessionId: string };
      // Start transcription with the full session data
      const service = new TranscribeService(redisClient, natsClient);
      service.stopTranscription(data.sessionId);

      logger.debug(
        `Recieved Transcription session stop event: ${data.sessionId}`
      );
    },
  });

  // Subscription: transcription.session.paused
  natsClient.subscribe("command.transcribe.pause", {
    queue: queueGroup,
    callback: (_err, msg) => {
      if (_err) {
        logger.error("Error receiving transcription paused event:", _err);
        return;
      }
      // todo: implement pause transcription
    },
  });

  // Subscription: transcription.session.resumed
  natsClient.subscribe("command.transcribe.resume", {
    queue: queueGroup,
    callback: (_err, msg) => {
      if (_err) {
        logger.error("Error receiving transcription resumed event:", _err);
        return;
      }
      // todo: implement resume transcription
    },
  });
}

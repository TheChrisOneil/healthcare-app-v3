import asyncio
import json
import os
import aioredis  # Redis client
from dotenv import load_dotenv
from app.nats_client import NATSClient
from app.logger import logger

# Load environment variables
load_dotenv()


class AOFService:
    def __init__(self, nats_client):
        self.nats_client = nats_client
        self.redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        self.redis_client = None

    async def start(self):
        """Start the AOF Service."""
        logger.info("Starting AOF Service...")
        logger.info(f"Connecting to Redis at {self.redis_url}...")
        self.redis_client = await aioredis.from_url(self.redis_url)
        await self.nats_client.connect()
        await self.subscribe_to_events()
        logger.info("AOF Service started.")

    async def run(self):
        """
        Continuously runs the AOF Service to process NATS messages.
        Keeps the NATS client active and listens for events.
        """
        while True:
            try:
                logger.info("Starting AOF Service main loop...")
                await asyncio.Future()  # Keeps the loop running indefinitely
            except asyncio.CancelledError:
                # Graceful shutdown in case of cancellation
                logger.info("AOF Service main loop cancelled.")
                break
            except Exception as e:
                logger.error(f"Error in AOF Service main loop: {e}")
                await asyncio.sleep(5)  # Avoid tight retry loops
            
    async def shutdown(self):
        """Shut down the service."""
        logger.info("Shutting down AOF Service...")
        if self.redis_client:
            await self.redis_client.close()
            logger.info("Redis client closed.")
        try:
            await self.nats_client.nc.drain()
            logger.info("NATS client drained successfully.")
        except Exception as e:
            logger.error(f"Error during NATS client drain: {e}")
        logger.info("AOF Service shut down.")

    async def retrieve_session_state(self, session_id):
        """Retrieve session state from Redis."""
        try:
            state = await self.redis_client.get(session_id)
            if state:
                return json.loads(state)
            logger.info(f"No existing state found for session {session_id}. Initializing new state.")
            return {}  # Default state if not found
        except Exception as e:
            logger.error(f"Error retrieving state for session {session_id}: {e}")
            return {}

    async def save_session_state(self, session_id, state):
        """Save session state to Redis."""
        try:
            await self.redis_client.set(session_id, json.dumps(state))
            logger.info(f"State saved for session {session_id}.")
        except Exception as e:
            logger.error(f"Error saving state for session {session_id}: {e}")

    async def process_transcription(self, msg):
        """Process transcription message."""
        try:
            data = json.loads(msg.data.decode())
            session_id = data.get("sessionId")
            transcript = data.get("transcript")

            if not session_id:
                logger.error("Received message without sessionId. Discarding.")
                return

            logger.info(f"Processing transcription for session {session_id}: {transcript}")
            # Retrieve state from Redis
            session_state = await self.retrieve_session_state(session_id)

            # Perform processing (e.g., appending transcript to session state)
            session_state["transcriptions"] = session_state.get("transcriptions", [])
            session_state["transcriptions"].append(transcript)

            # Save updated state back to Redis
            await self.save_session_state(session_id, session_state)

            logger.info(f"Processed transcription for session {session_id}: {transcript}")
        except Exception as e:
            logger.error(f"Error processing transcription message: {e}")

    async def subscribe_to_events(self):
        """Subscribe to NATS topics."""
        await self.nats_client.nc.subscribe(
            "transcription.word.transcribed",
            cb=self.process_transcription
        )
        logger.info("Subscribed to transcription.word.transcribed.")
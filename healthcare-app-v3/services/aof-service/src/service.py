import asyncio
import json
import os
import aioredis  # Redis client
from dotenv import load_dotenv
from src.nats_client import NATSClient
from src.logger import logger
from datetime import datetime

# Load the environment variables
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

    async def save_session_state(self, session_id, state):
        """Save session state to Redis."""
        try:
            await self.redis_client.set(session_id, json.dumps(state))
            logger.info(f"State saved for session {session_id}.")
        except Exception as e:
            logger.error(f"Error saving state for session {session_id}: {e}")

    async def retrieve_session_state(self, session_id):
        """Retrieve session state from Redis."""
        try:
            state = await self.redis_client.get(session_id)
            return json.loads(state) if state else {}
        except Exception as e:
            logger.error(f"Error retrieving state for session {session_id}: {e}")
            return {}

            
    async def process_command(self, msg, command_type):
        """Process commands for session control."""
        try:
            data = json.loads(msg.data.decode())
            session_id = data.get("sessionId")
            timestamp = datetime.now().isoformat()
             # Append or prepend the microservice name to the session ID
            unique_session_id = f"{session_id}:aof-service"  
            logger.info(f"Processing {command_type} command for this session: {unique_session_id}.")

            if not session_id:
                logger.error(f"Received {command_type} command without sessionId. Discarding.")
                return

            # Retrieve the state from Redis using the unique session ID
            session_state = await self.retrieve_session_state(unique_session_id)

            if command_type == "start":
                logger.info(f"Starting session session-microservice index {unique_session_id}.")

                # Save session initiation data from the start command
                session_initiation = {
                    "sessionId": session_id,
                    "patientDID": data.get("patientDID"),
                    "clinicianDID": data.get("clinicianDID"),
                    "clinicName": data.get("clinicName"),
                    "startTime": data.get("startTime", timestamp),
                    "audioConfig": data.get("audioConfig", {}),
                    "transcriptPreferences": data.get("transcriptPreferences", {})
                }

                # Update the session state with initiation data
                session_state.update(session_initiation)

            # Add command to session control
            session_control = {
                "sessionId": session_id,
                "action": command_type,
                "timestamp": timestamp,
                "reason": data.get("reason"),
            }

            session_state["control"] = session_state.get("control", [])
            session_state["control"].append(session_control)

            if command_type == "stop":
                logger.info(f"Stopping session {unique_session_id}.")
                session_state["endTime"] = timestamp

            # Save updated session state
            await self.save_session_state(unique_session_id, session_state)
            logger.info(f"Processed {command_type} command for session {unique_session_id}.")
        except Exception as e:
            logger.error(f"Error processing {command_type} command: {e}") 
    
    async def process_command_start(self, msg):
        """Process the 'start' command."""
        await self.process_command(msg, "start")

    async def process_command_stop(self, msg):
        """Process the 'stop' command."""
        await self.process_command(msg, "stop")

    async def process_command_pause(self, msg):
        """Process the 'pause' command."""
        await self.process_command(msg, "pause")

    async def process_command_resume(self, msg):
        """Process the 'resume' command."""
        await self.process_command(msg, "resume")    
    
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
            
            await self.publish_highlighted_word(session_id, transcript)

            logger.info(f"Processed transcription for session {session_id}: {transcript}")
        except Exception as e:
            logger.error(f"Error processing transcription message: {e}")
    
    async def publish_highlighted_word(self, session_id, highlighted_word):
        """
        Publish a message to the 'aof.word.highlighted' topic.
        
        Args:
            session_id (str): The ID of the session.
            highlighted_word (str): The highlighted word to publish.
        """
        subject = "aof.word.highlighted"
        message = {
            "sessionId": session_id,
            "highlightedWord": highlighted_word,
            "timestamp": datetime.now().isoformat()
        }

        try:
            logger.info(f"Publishing to {subject}: {message}")
            await self.nats_client.nc.publish(subject, json.dumps(message).encode())
            await self.nats_client.nc.flush()  # Ensure message delivery
            logger.info(f"Message published to {subject}: {message}")
        except Exception as e:
            logger.error(f"Error publishing to {subject}: {e}")

    async def subscribe_to_events(self):
        """
        Subscribe to relevant NATS topics for transcription and commands.
        """
        logger.info("Subscribing to transcription and command events...")

        # Subscribe to transcription events
        await self.nats_client.nc.subscribe(
            "transcription.word.transcribed",
            "aof-transcription-queue",
            cb=self.process_transcription
        )
        logger.info("Subscribed to transcription.word.transcribed.")

        # Subscribe to specific command events
        await self.nats_client.nc.subscribe(
            "command.transcribe.start",
            "aof-command-start-queue",
            cb=self.process_command_start
        )
        logger.info("Subscribed to command.transcribe.start with queue group aof-command-start-queue.")

        await self.nats_client.nc.subscribe(
            "command.transcribe.stop",
        "aof-command-stop-queue",
        cb=self.process_command_stop
    )
        logger.info("Subscribed to command.transcribe.stop with queue group aof-command-stop-queue.")

        await self.nats_client.nc.subscribe(
            "command.transcribe.pause",
            "aof-command-pause-queue",
            cb=self.process_command_pause
        )
        logger.info("Subscribed to command.transcribe.pause with queue group aof-command-pause-queue.")

        await self.nats_client.nc.subscribe(
            "command.transcribe.resume",
        "aof-command-resume-queue",
        cb=self.process_command_resume
        )
        logger.info("Subscribed to command.transcribe.resume with queue group aof-command-resume-queue.")
        

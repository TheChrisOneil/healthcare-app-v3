from nats.aio.client import Client as NATS
from app.logger import logger
import os
import asyncio

class NATSClient:
    def __init__(self):
        self.nc = NATS()

    async def connect(self):
        """Connect to the NATS server."""
        server = os.getenv("NATS_SERVER", "nats://localhost:4222")

        async def disconnected_cb():
            logger.warning("Disconnected from NATS server.")

        async def reconnected_cb():
            logger.info("Reconnected to NATS server.")

        async def error_cb(e):
            logger.error(f"Error occurred: {e}")

        async def closed_cb():
            logger.error("Connection to NATS server is closed.")

        retries = 0
        while True:
            try:
                await self.nc.connect(
                    servers=[server],
                    reconnected_cb=reconnected_cb,
                    disconnected_cb=disconnected_cb,
                    error_cb=error_cb,
                    closed_cb=closed_cb,
                    max_reconnect_attempts=-1,  # Infinite reconnect attempts
                )
                logger.info(f"Connected to NATS server at {server}.")
                return
            except Exception as e:
                retries += 1
                logger.warning(f"Attempt {retries}: Failed to connect to NATS. Retrying in 5 seconds... Error: {e}")
                await asyncio.sleep(5)
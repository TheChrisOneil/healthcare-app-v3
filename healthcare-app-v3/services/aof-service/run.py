from src import create_app
from src.routes import routes
from src.service import AOFService
from src.nats_client import NATSClient
import asyncio
import threading
from src.logger import logger

# Create and configure the Flask app
app = create_app()
app.register_blueprint(routes)


def run_flask_app():
    """Run the Flask app in a separate thread."""
    app.run(host="0.0.0.0", port=3003, debug=True, use_reloader=False) # Disable reloader to prevent multiple instances


if __name__ == "__main__":
    # Start Flask app in a separate thread
    flask_thread = threading.Thread(target=run_flask_app)
    flask_thread.daemon = True  # Ensure thread closes when the main program exits
    flask_thread.start()

        # Initialize and run the AOF Service
    # Create the NATSClient instance
    nats_client = NATSClient()

    # Pass NATSClient to AOFService
    aof_service = AOFService(nats_client=nats_client)
    # Start the async service
    loop = asyncio.get_event_loop()
    try:
        logger.info("Starting AOF Service...")
        # Initialize the service (connect to Redis and NATS)
        loop.run_until_complete(aof_service.start())
        # Run the service continuously
        loop.run_until_complete(aof_service.run())
    except KeyboardInterrupt:
        logger.info("Received shutdown signal.")
        # Gracefully shut down the service
        loop.run_until_complete(aof_service.shutdown())
    finally:
        # Stop the Flask thread
        flask_thread.join()
        loop.stop()
        loop.close()
        logger.info("AOF Service stopped.")
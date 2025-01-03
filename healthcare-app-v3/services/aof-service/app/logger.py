import logging
import os
from datetime import datetime
from dotenv import load_dotenv
import pytz

# Load environment variables
load_dotenv()

# Logger Configuration
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
LOG_FILE = "./logs/aof-service.log"
TIMEZONE = pytz.timezone("America/Chicago")

# Ensure the log directory exists
LOG_DIR = "./logs"
if not os.path.exists(LOG_DIR):
    os.makedirs(LOG_DIR)

class PlainTextFormatter(logging.Formatter):
    def formatTime(self, record, datefmt=None):
        record_time = datetime.fromtimestamp(record.created, tz=TIMEZONE)
        return record_time.strftime("%Y-%m-%d %H:%M:%S")

    def format(self, record):
        time = self.formatTime(record)
        level = record.levelname.lower()
        message = record.getMessage()
        return f"{time} [{level}]: {message}"


# Create logger
logger = logging.getLogger("AOFService")
logger.setLevel(LOG_LEVEL)

# Console handler
console_handler = logging.StreamHandler()
console_formatter = PlainTextFormatter()
console_handler.setFormatter(console_formatter)
logger.addHandler(console_handler)

# File handler
file_handler = logging.FileHandler(LOG_FILE)
file_formatter = PlainTextFormatter()
file_handler.setFormatter(file_formatter)
logger.addHandler(file_handler)

# Log initialization message
logger.info("Logger initialized successfully.")
# Use the official Python 3.10 slim image as the base
FROM python:3.10-slim

# Set environment variables to prevent Python from writing pyc files and use unbuffered output
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Set the working directory inside the container
WORKDIR /app
RUN python -m pip install --upgrade pip
# Install system dependencies for building Python packages
RUN apt-get update && apt-get install -y \
    gcc \
    python3-dev \
    build-essential \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Copy the requirements file
COPY ./services/aof-service/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the SentenceTransformer model to cache it in the Docker image
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"



# Copy the rest of the application code (use volume mounts for development)
COPY ./services/aof-service/ .

# Create the logs directory
RUN mkdir -p /app/logs

# Expose the port the service listens on
EXPOSE 3003

# Command to run the application
CMD ["python", "run.py"]
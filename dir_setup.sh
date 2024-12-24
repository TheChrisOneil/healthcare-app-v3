#!/bin/bash

# Define base directory
BASE_DIR="healthcare-app"

# Create main directory
mkdir -p $BASE_DIR

# Create subdirectories
mkdir -p $BASE_DIR/api-gateway
mkdir -p $BASE_DIR/database
mkdir -p $BASE_DIR/frontend/src
mkdir -p $BASE_DIR/frontend/public
mkdir -p $BASE_DIR/services/transcribe-service
mkdir -p $BASE_DIR/services/foo-agent
mkdir -p $BASE_DIR/storage

# Navigate to base directory
cd $BASE_DIR

# Create placeholder files in each subdirectory
touch api-gateway/gateway.js
touch api-gateway/Dockerfile
touch api-gateway/package.json

touch database/init.sql
touch database/Dockerfile
touch database/docker-compose.override.yml

touch frontend/src/App.js
touch frontend/src/index.js
touch frontend/public/index.html
touch frontend/Dockerfile
touch frontend/package.json

touch services/transcribe-service/transcribe-service.js
touch services/transcribe-service/Dockerfile
touch services/transcribe-service/package.json

touch services/foo-agent/foo-agent.js
touch services/foo-agent/Dockerfile
touch services/foo-agent/package.json

touch storage/storage-config.yaml

# Create top-level docker-compose file
touch docker-compose.yml

# Print success message
echo "Healthcare app directory structure created successfully!"

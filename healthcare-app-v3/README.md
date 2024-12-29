# Healthcare App

A microservices-based application designed for real-time transcription and event-driven interactions in a healthcare environment. The app uses modern technologies like Docker, NGINX, WebSockets, and NATS to ensure scalability and responsiveness.

---

## Architecture Overview

The application is built using a microservices architecture, with components communicating through NATS message broker for event-driven functionality. The API Gateway handles RESTful and WebSocket communication, while NGINX serves as a reverse proxy for routing requests.

---

### Key Components

1. **Frontend**:
   - Built with React for real-time transcription display and user interactions.
   - Communicates with the API Gateway via WebSockets for real-time updates.
   - Sends REST API commands for transcription control (e.g., start, stop).

2. **API Gateway**:
   - Acts as a central hub for routing API requests and WebSocket messages.
   - Connects to NATS for publishing and subscribing to events.
   - Provides REST endpoints for transcription control.

3. **Transcribe Service**:
   - Processes transcription events and publishes updates to NATS.
   - Handles real-time transcription operations.

4. **Foo Agent**:
   - A template agent for extending functionality.
   - Demonstrates how services can subscribe to NATS topics and act on events.

5. **NGINX**:
   - Serves as a reverse proxy for routing HTTP and WebSocket traffic.
   - Routes `/api/` requests to the API Gateway and `/realtime/` to WebSocket services.
   - Serves static frontend files.

6. **NATS**:
   - Message broker for asynchronous communication between microservices.
   - Ensures reliable event-driven messaging.

---

## Workflow

### 1. Starting a Transcription Session
- **Frontend**:
  - Sends a `POST` request to `/api/startTranscription`.
- **API Gateway**:
  - Publishes a `transcription.session.started` event to NATS.
- **Transcribe Service**:
  - Subscribes to the `transcription.session.started` event and begins processing.

### 2. Real-Time Transcription
- **Transcribe Service**:
  - Publishes `transcription.word.transcribed` events to NATS.
- **API Gateway**:
  - Subscribes to these events and forwards them to the frontend via WebSocket.

### 3. Stopping a Transcription Session
- **Frontend**:
  - Sends a `POST` request to `/api/stopTranscription`.
- **API Gateway**:
  - Publishes a `transcription.session.stopped` event to NATS.
- **Transcribe Service**:
  - Subscribes to the `transcription.session.stopped` event and stops processing.

---

## Technologies Used

- **React**: Real-time UI for transcription display and user interactions.
- **Node.js**: Backend services for API Gateway and microservices.
- **TypeScript**: Ensures type safety and robust development.
- **WebSockets**: Real-time communication between the frontend and backend.
- **NATS**: Event-driven communication between services.
- **NGINX**: Reverse proxy for routing HTTP and WebSocket traffic.
- **Docker**: Containerization for isolated and scalable environments.

---

## How to Run the Application

### Prerequisites
- Docker and Docker Compose installed on your system.

### Starting the Application
```bash
docker-compose up --build
```

---

## Adding a New Service

To add a new microservice to the **Healthcare App** ecosystem, follow these steps:

### 1. Directory Structure
Create a new directory for your service under the `services` folder. For example, to create `service-three`:
```bash
mkdir -p services/service-three/src
```

Ensure the following files are present:
- `services/service-three/src/service-three.ts` (main entry point)
- `services/service-three/src/logger.ts` (logging module)
- `services/service-three/tsconfig.local.json` (local TypeScript configuration)
- `services/service-three/tsconfig.docker.json` (Docker TypeScript configuration)
- `services/service-three/Dockerfile` (Dockerfile for the service)
- `services/service-three/package.json` (package dependencies and scripts)

### 2. Update Docker Compose
Add a new service definition to `docker-compose.yml`:
```yaml
service-three:
  build:
    context: .
    dockerfile: ./services/service-three/Dockerfile
  volumes:
    - ./storage/recordings:/app/storage/recordings
    - ./storage/transcriptions:/app/storage/transcriptions
    - ./shared-interfaces:/app/shared-interfaces
    - ./logs:/app/logs
  ports:
    - "3003:3000" # Application port
    - "9233:9229" # Debugger port
  logging:
    driver: json-file
    options:
      max-size: "10m"
      max-file: "5"
  networks:
    - app-network
```

### 3. Dockerfile for the New Service
Create a `Dockerfile` for the service:
```dockerfile
# Use Node.js LTS version
FROM node:18

# Set the working directory
WORKDIR /app

# Copy package files and install dependencies
COPY ./services/service-three/package*.json ./
RUN npm install --silent

# Copy the application code and shared interfaces
COPY ./shared-interfaces/src ./shared-interfaces
COPY ./services/service-three/src ./src

# Copy Docker-specific TypeScript configuration
COPY ./services/service-three/tsconfig.docker.json ./tsconfig.json

# Set up logging directory
RUN mkdir -p /app/logs && chmod 755 /app/logs

# Compile TypeScript
RUN npm run build:docker

# Expose ports for application and debugging
EXPOSE 3000 9229

# Command to start the service
CMD ["npm", "run", "dev:docker"]
```

### 4. TypeScript Configuration
Create `tsconfig.local.json` for local development:
```json
{
  "compilerOptions": {
    "target": "es6",
    "module": "commonjs",
    "lib": ["es2018"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./",
    "baseUrl": "./",
    "paths": {
      "shared-interfaces/*": ["../../shared-interfaces/src/*"]
    }
  },
  "include": ["src/**/*", "../../shared-interfaces/src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Create `tsconfig.docker.json` for Docker builds:
```json
{
  "compilerOptions": {
    "target": "es6",
    "module": "commonjs",
    "lib": ["es2018"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./",
    "baseUrl": "./",
    "paths": {
      "shared-interfaces/*": ["/app/shared-interfaces/*"]
    }
  },
  "include": ["src/**/*", "/app/shared-interfaces/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 5. Package.json
Create `package.json` for the service:
```json
{
  "name": "service-three",
  "version": "1.0.0",
  "description": "Service Three for the Healthcare App",
  "main": "dist/service-three.js",
  "scripts": {
    "build": "tsc --project tsconfig.json",
    "build:local": "tsc --project tsconfig.local.json",
    "build:docker": "tsc --project tsconfig.docker.json",
    "start": "node dist/service-three.js",
    "start:debug": "node --inspect=0.0.0.0:9229 dist/service-three.js",
    "dev": "nodemon --watch ./src --watch ../shared-interfaces --exec ts-node ./src/service-three.ts"
  },
  "dependencies": {
    "dotenv": "^16.0.3",
    "winston": "^3.3.3",
    "nats": "^2.8.0"
  },
  "devDependencies": {
    "typescript": "^5.2.2",
    "ts-node": "^10.9.1",
    "@types/node": "^18.15.11",
    "nodemon": "^2.0.22"
  }
}
```

### 6. Logging
Update `logger.ts` to ensure unique log files:
```typescript
import winston from "winston";

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
    }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: "/app/logs/service-three.log",
      level: "info",
    }),
  ],
});

export default logger;
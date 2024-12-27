# **Healthcare App**

A microservices-based application designed for real-time transcription and event-driven interactions in a healthcare environment. The app uses modern technologies like Docker, NGINX, WebSockets, and NATS to ensure scalability and responsiveness.

---

## **Architecture Overview**

The application is built using a microservices architecture, with components communicating through NATS message broker for event-driven functionality. The API Gateway handles RESTful and WebSocket communication, while NGINX serves as a reverse proxy for routing requests.

## **Technologies Used**

- React: Real-time UI for transcription display and user interactions.
- Node.js: Backend services for API Gateway and microservices.
- TypeScript: Ensures type safety and robust development.
- WebSockets: Real-time communication between the frontend and backend.
- NATS: Event-driven communication between services.
- NGINX: Reverse proxy for routing HTTP and WebSocket traffic.
- Docker: Containerization for isolated and scalable environments.
- Winston: Centralized and structured logging.

---

### **Key Components**

1. **Frontend**:
   - Built with React for real-time transcription display and user interactions.
   - Communicates with the API Gateway via WebSockets for real-time updates.
   - Sends REST API commands for transcription control (e.g., start, stop).

2. **API Gateway**:
   - Acts as a central hub for routing API requests and WebSocket messages.
   - Connects to NATS for publishing and subscribing to events.
   - Provides REST endpoints for transcription control.
   - Implements structured logging for debugging, informational logs, and error tracking.

3. **Transcribe Service**:
   - Processes transcription events and publishes updates to NATS.
   - Handles real-time transcription operations.
   - Uses AWS Transcribe Streaming (or mocked functionality) for transcription.
   - Logs detailed information for transcription processes and errors.

4. **Foo Agent**:
   - A template agent for extending functionality.
   - Demonstrates how services can subscribe to NATS topics and act on events.
   - Includes logging for all significant actions and errors.

5. **NGINX**:
   - Serves as a reverse proxy for routing HTTP and WebSocket traffic.
   - Routes `/api/` requests to the API Gateway and `/realtime/` to WebSocket services.
   - Serves static frontend files.

6. **NATS**:
   - Message broker for asynchronous communication between microservices.
   - Ensures reliable event-driven messaging.

7. **Logging**:
   - All backend services implement a structured logging system using `winston` to centralize and standardize logs.
   - Logs are stored in the `logs` directory of each service and are accessible on the host machine via Docker volumes.
   - Logging levels:
     - **`error`**: Captures critical failures or issues.
     - **`warn`**: Logs non-critical warnings.
     - **`info`**: Captures general application flow.
     - **`debug`**: Logs detailed information for debugging purposes.

---

## **Workflow**

### **1. Starting a Transcription Session**
- **Frontend**:
  - Sends a `POST` request to `/api/startTranscription`.
- **API Gateway**:
  - Publishes a `transcription.session.started` event to NATS.
  - Logs the event at the `info` level.
- **Transcribe Service**:
  - Subscribes to the `transcription.session.started` event and begins processing.
  - Logs the session initiation.

### **2. Real-Time Transcription**
- **Transcribe Service**:
  - Publishes `transcription.word.transcribed` events to NATS.
  - Logs each word and timestamp at the `debug` level.
- **API Gateway**:
  - Subscribes to these events and forwards them to the frontend via WebSocket.
  - Logs received and forwarded messages.

### **3. Stopping a Transcription Session**
- **Frontend**:
  - Sends a `POST` request to `/api/stopTranscription`.
- **API Gateway**:
  - Publishes a `transcription.session.stopped` event to NATS.
  - Logs the event at the `info` level.
- **Transcribe Service**:
  - Subscribes to the `transcription.session.stopped` event and stops processing.
  - Logs the session termination.

---

## **Logging Setup**

1. **Logger Implementation**:
   - Each service uses a `logger.ts` module implemented with `winston`.
   - Logs are formatted with timestamps and log levels (`error`, `warn`, `info`, `debug`).

2. **Log File Locations**:
   - Logs are stored in a dedicated `logs` directory within each service.
   - Example: `api-gateway/logs/api-gateway.log`.

3. **Docker Configuration**:
   - Docker volumes are used to persist log files on the host machine.
   - Example:
     ```yaml
     services:
       api-gateway:
         build:
           context: ./api-gateway
         volumes:
           - ./api-gateway/logs:/app/logs
     ```

4. **Example Log Outputs**:
   - `info`: `"2024-12-27T15:30:00.000Z [INFO] Transcription session started: abc123"`
   - `debug`: `"2024-12-27T15:30:01.000Z [DEBUG] Transcribed word: example"`

---

## **How to Run the Application**

### **1. Prerequisites**
- Docker and Docker Compose installed on your system.

### **2. Start the Application**
```bash
docker-compose up --build

### **3. Access logs**
```bash
api-gateway/logs/api-gateway.log
transcribe-service/logs/transcribe-service.log

### **4. Debugging**
```bash
docker logs <container_name> -f



# **Healthcare App**

A microservices-based application designed for real-time transcription and event-driven interactions in a healthcare environment. The app uses modern technologies like Docker, NGINX, WebSockets, and NATS to ensure scalability and responsiveness.

---

## **Architecture Overview**

The application is built using a microservices architecture, with components communicating through NATS message broker for event-driven functionality. The API Gateway handles RESTful and WebSocket communication, while NGINX serves as a reverse proxy for routing requests.

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

## **Workflow**

### **1. Starting a Transcription Session**
- **Frontend**:
  - Sends a `POST` request to `/api/startTranscription`.
- **API Gateway**:
  - Publishes a `transcription.session.started` event to NATS.
- **Transcribe Service**:
  - Subscribes to the `transcription.session.started` event and begins processing.

### **2. Real-Time Transcription**
- **Transcribe Service**:
  - Publishes `transcription.word.transcribed` events to NATS.
- **API Gateway**:
  - Subscribes to these events and forwards them to the frontend via WebSocket.

### **3. Stopping a Transcription Session**
- **Frontend**:
  - Sends a `POST` request to `/api/stopTranscription`.
- **API Gateway**:
  - Publishes a `transcription.session.stopped` event to NATS.
- **Transcribe Service**:
  - Subscribes to the `transcription.session.stopped` event and stops processing.

---

## **Technologies Used**

- **React**: Real-time UI for transcription display and user interactions.
- **Node.js**: Backend services for API Gateway and microservices.
- **TypeScript**: Ensures type safety and robust development.
- **WebSockets**: Real-time communication between the frontend and backend.
- **NATS**: Event-driven communication between services.
- **NGINX**: Reverse proxy for routing HTTP and WebSocket traffic.
- **Docker**: Containerization for isolated and scalable environments.

---

## **How to Run the Application**

### **1. Prerequisites**
- Docker and Docker Compose installed on your system.

### **2. Start the Application**
```bash
docker-compose up --build

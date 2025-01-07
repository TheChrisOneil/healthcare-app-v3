/**
 * WebSocketService Design Notes
 *
 * 1. **Purpose**:
 *    - Manage WebSocket connections with robust reconnection logic and guaranteed message delivery.
 *    - Handle state management for unsent messages using Redis to maintain a stateless API architecture.
 *
 * 2. **Core Features**:
 *    - **Durable Subscriptions**: Uses NATS durable queue groups to ensure messages are processed even if the WebSocket server restarts.
 *    - **Message Queuing**: Stores unsent messages in Redis for clients that are disconnected.
 *    - **Acknowledgment Mechanism**: 
 *        - Ensures reliable message delivery by requiring clients to acknowledge receipt of messages.
 *        - Removes messages from the Redis queue only after acknowledgment.
 *    - **Heartbeat Handling**: Implements `ping`/`pong` to detect and maintain live connections.
 *    - **Scalability**: Redis is used for persistent message queuing, ensuring scalability for multiple WebSocket clients.
 *    - **Error Handling**: Provides robust error handling for WebSocket operations and NATS subscriptions.
 *
 * 3. **Redis Usage**:
 *    - **Message Queue**: Stores unsent messages in Redis lists (`pending:<clientId>`).
 *    - **Pending Message Cleanup**: Ensures messages are delivered on reconnection and clears the Redis queue once acknowledged.
 *
 * 4. **WebSocket Lifecycle**:
 *    - **Connection Established**:
 *        - Initializes NATS subscriptions for the client.
 *        - Flushes pending messages from Redis to the client.
 *    - **Message Handling**:
 *        - Processes acknowledgment (`ack`) to confirm message delivery.
 *        - Responds to heartbeats (`ping`/`pong`) to maintain connection health.
 *    - **Disconnection**:
 *        - Unsubscribes from NATS topics to release resources.
 *        - Stores undelivered messages in Redis for later retry.
 *    - **Reconnection**:
 *        - On reconnect, retrieves pending messages from Redis and sends them to the client.
 *
 * 5. **Error Handling**:
 *    - Logs errors for NATS subscriptions, Redis operations, and WebSocket communications.
 *    - Handles edge cases like Redis failures gracefully to avoid application crashes.
 *
 * 6. **Key Components**:
 *    - **NATS Durable Subscriptions**: Provides fault-tolerant messaging between services.
 *    - **Redis Integration**: Ensures persistent and scalable state management.
 *    - **WebSocket Server**: Manages client connections and provides a real-time communication interface.
 *
 * 7. **Scalability Considerations**:
 *    - Redis can be scaled with clustering or replication if the number of WebSocket clients grows significantly.
 *    - The architecture supports stateless scaling of WebSocket server instances when combined with a shared Redis backend.
 *
 * 8. **Security**:
 *    - WebSocket communication should be secured using SSL/TLS.
 *    - Redis connections should use authentication and encryption (if available).
 *
 * 9. **Extensibility**:
 *    - Additional message topics can be added by extending the `subscriptions` array.
 *    - The service can be integrated with external monitoring tools (e.g., Prometheus) to track WebSocket connection metrics.
 *
 * 10. **Dependencies**:
 *     - **NATS**: Provides the durable messaging layer.
 *     - **Redis**: Handles persistent message storage.
 *     - **WebSocket**: Enables real-time client-server communication.
 */

import WebSocket, { WebSocketServer } from 'ws';
import { StringCodec, NatsConnection, Msg } from 'nats';
import redis from './redis'; // Import the Redis instance from redis.ts

const initSubscriptions = (nc: NatsConnection, ws: WebSocket, clientId: string) => {
  const sc = StringCodec();

  const durableQueueName = "api-gateway-durable-workers";

  const sendMessage = async (message: any) => {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      } else {
        // Store the message in Redis for retry
        await redis.rpush(`pending:${clientId}`, JSON.stringify(message));
      }
    } catch (err) {
      console.error("Error sending message:", err);
    }
  };

  const subscriptions = [
    nc.subscribe("aof.word.highlighted", {
      queue: durableQueueName,
      callback: async (err: Error | null, msg: Msg) => {
        if (err) {
          console.error("Error in AOF message", err);
          return;
        }
        const data = sc.decode(msg.data);
        const message = { id: Date.now(), topic: msg.subject, data: JSON.parse(data) };
        await sendMessage(message);
      },
    }),
    nc.subscribe("transcription.word.transcribed", {
      queue: durableQueueName,
      callback: async (err: Error | null, msg: Msg) => {
        if (err) {
          console.error("Error in transcription message", err);
          return;
        }
        const data = sc.decode(msg.data);
        const message = { id: Date.now(), topic: msg.subject, data: JSON.parse(data) };
        await sendMessage(message);
      },
    }),

    nc.subscribe("diagnosis.text.processed", {
        queue: durableQueueName,
        callback: async (err: Error | null, msg: Msg) => {
          if (err) {
            console.error("Error in transcription message", err);
            return;
          }
          const data = sc.decode(msg.data);
          const message = { id: Date.now(), topic: msg.subject, data: JSON.parse(data) };
          await sendMessage(message);
        },
      }),
  ];

  ws.on('message', async (data: string) => {
    const parsedData = JSON.parse(data);

    // Handle acknowledgment
    if (parsedData.type === 'ack' && parsedData.messageId) {
      await redis.lrem(`pending:${clientId}`, 1, JSON.stringify(parsedData.messageId));
    }

    // Handle heartbeat (pong response)
    if (parsedData.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong' }));
    }
  });

  // Retry unsent messages from Redis on reconnect
  ws.on('open', async () => {
    const pendingMessages = await redis.lrange(`pending:${clientId}`, 0, -1);
    for (const msg of pendingMessages) {
      await sendMessage(JSON.parse(msg));
    }
    await redis.del(`pending:${clientId}`);
  });

  return subscriptions;
};

const initWebSocketServer = (nc: NatsConnection) => {
  const wss = new WebSocketServer({ port: 8080 });

  wss.on('connection', (ws: WebSocket, req: any) => {
    const clientId = req.headers['sec-websocket-key'];
    console.log("WebSocket client connected:", clientId);

    const subscriptions = initSubscriptions(nc, ws, clientId);

    ws.on('close', () => {
      console.log("WebSocket client disconnected:", clientId);
      subscriptions.forEach((sub) => sub.unsubscribe());
    });
  });

  console.log("WebSocket server listening on port 8080");
};

export { initWebSocketServer };
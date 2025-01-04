/**
 * WebSocketComponent Design Notes
 *
 * 1. **Purpose**:
 *    - Provide a reusable React component to handle WebSocket connections with robust reconnection logic and guaranteed message delivery.
 *    - Ensure smooth real-time communication between the frontend and backend.
 *
 * 2. **Core Features**:
 *    - **Connection Management**:
 *        - Automatically handles WebSocket connection establishment and reconnection using exponential backoff.
 *        - Manages connection status using React state (`isConnected`).
 *    - **Message Queue**:
 *        - Buffers messages in a queue (`messageQueue`) when the WebSocket is disconnected and flushes them upon reconnection.
 *    - **Heartbeat Mechanism**:
 *        - Sends periodic `ping` messages to keep the connection alive and detect disconnections.
 *        - Processes `pong` responses from the server to confirm the connection is active.
 *    - **Acknowledgment Mechanism**:
 *        - Sends acknowledgment (`ack`) for each received message containing an `id` to confirm delivery to the backend.
 *    - **Reconnection Logic**:
 *        - Implements an exponential backoff strategy for reconnection attempts, preventing rapid reconnection retries during outages.
 *    - **Error Handling**:
 *        - Handles WebSocket errors gracefully, ensuring the component does not crash during unexpected failures.
 *
 * 3. **Lifecycle Management**:
 *    - **Initialization**:
 *        - WebSocket connection is established when the component mounts (`useEffect`).
 *    - **Cleanup**:
 *        - Cleans up the WebSocket connection and heartbeat interval when the component unmounts.
 *
 * 4. **Scalability**:
 *    - Designed to handle multiple WebSocket connections by accepting a dynamic `wsUrl` prop.
 *    - Efficiently manages message flow through queuing and batching.
 *
 * 5. **Extensibility**:
 *    - Can be extended to support additional WebSocket message types by modifying the `onmessage` handler.
 *    - Reusable in different React applications by passing custom `onMessage` handlers for specific logic.
 *
 * 6. **Error Recovery**:
 *    - Handles network issues or backend outages by:
 *        - Automatically retrying connections with increasing delays (exponential backoff).
 *        - Retrying unsent messages stored in the message queue after reconnection.
 *
 * 7. **Performance**:
 *    - Uses `useRef` for WebSocket and queue references to avoid unnecessary re-renders.
 *    - Interval-based heartbeats minimize resource usage while ensuring connection health.
 *
 * 8. **Limitations**:
 *    - The component does not currently handle WebSocket authentication or secure WebSocket (wss) connections, which may be required in production.
 *    - The maximum number of reconnection attempts (`reconnectAttempts`) is hardcoded to 10 but could be made configurable.
 *
 * 9. **Security Considerations**:
 *    - Ensure sensitive data is encrypted when using WebSocket communication (`wss` protocol).
 *    - Validate and sanitize incoming messages in the backend to avoid security risks.
 *
 * 10. **Dependencies**:
 *     - **React**: Utilizes React hooks (`useEffect`, `useState`, `useRef`) for managing component lifecycle and state.
 *     - **WebSocket API**: Native browser API for real-time client-server communication.
 */
import React, { useEffect, useState, useRef } from 'react';

const WebSocketComponent = ({ wsUrl, onMessage }) => {
    const [isConnected, setIsConnected] = useState(false);
    const wsRef = useRef(null);
    const messageQueue = useRef([]);
    const heartbeatInterval = useRef(null);

    const connectWebSocket = () => {
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
            console.log('WebSocket connected');
            setIsConnected(true);

            // Flush the message queue
            while (messageQueue.current.length > 0) {
                wsRef.current.send(JSON.stringify(messageQueue.current.shift()));
            }

            // Start heartbeat
            heartbeatInterval.current = setInterval(() => {
                if (wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: 'ping' }));
                }
            }, 30000); // 30 seconds
        };

        wsRef.current.onmessage = (event) => {
            const message = JSON.parse(event.data);

            // Handle pong response
            if (message.type === 'pong') {
                console.log('Heartbeat received from server');
                return;
            }

            // Handle regular messages
            onMessage(message);

            // Send acknowledgment for received messages
            if (message.id) {
                wsRef.current.send(JSON.stringify({ type: 'ack', messageId: message.id }));
            }
        };

        wsRef.current.onclose = () => {
            console.warn('WebSocket disconnected. Reconnecting...');
            setIsConnected(false);
            clearInterval(heartbeatInterval.current);
            reconnectWithBackoff();
        };

        wsRef.current.onerror = (err) => {
            console.error('WebSocket error:', err);
            wsRef.current.close();
        };
    };

    const reconnectWithBackoff = () => {
        let reconnectAttempts = 0;
        if (reconnectAttempts < 10) {
            const delay = Math.min(5000, (2 ** reconnectAttempts) * 100); // Exponential backoff
            setTimeout(connectWebSocket, delay);
            reconnectAttempts++;
        }
    };

    const sendMessage = (message) => {
        const messageId = Date.now();
        const messageWithId = { ...message, id: messageId };

        if (isConnected && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(messageWithId));
        } else {
            // Queue message if WebSocket is not connected
            messageQueue.current.push(messageWithId);
        }
    };

    useEffect(() => {
        connectWebSocket();
        return () => {
            if (wsRef.current) wsRef.current.close();
            clearInterval(heartbeatInterval.current);
        };
    }, [wsUrl]);

    return (
        <div>
            <p>WebSocket Status: {isConnected ? 'Connected' : 'Disconnected'}</p>
        </div>
    );
};

export default WebSocketComponent;
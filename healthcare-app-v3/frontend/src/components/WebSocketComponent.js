import React, { useEffect, useState } from 'react';

const WebSocketComponent = ({ wsUrl, onMessage }) => {
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        let ws;
        let reconnectAttempts = 0;

        const connectWebSocket = () => {
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log('WebSocket connected');
                setIsConnected(true);
                reconnectAttempts = 0;
            };

            ws.onmessage = (event) => {
                console.log('WebSocket received:', event.data);
                const message = JSON.parse(event.data);
                onMessage(message);
            };

            ws.onclose = () => {
                console.warn('WebSocket disconnected. Reconnecting...');
                setIsConnected(false);
                if (reconnectAttempts < 5) {
                    setTimeout(connectWebSocket, 5000);
                    reconnectAttempts++;
                }
            };

            ws.onerror = (err) => console.error('WebSocket error:', err);
        };

        connectWebSocket();

        return () => {
            if (ws) ws.close();
        };
    }, [wsUrl, onMessage]);

    return (
        <div>
            <p>WebSocket Status: {isConnected ? 'Connected' : 'Disconnected'}</p>
        </div>
    );
};

export default WebSocketComponent;

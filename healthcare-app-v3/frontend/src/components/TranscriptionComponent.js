import React, { useState } from 'react';
import WebSocketComponent from './WebSocketComponent';

const TranscriptionComponent = () => {
    const [transcription, setTranscription] = useState('');
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss://' : 'ws://'}${window.location.host}/realtime/`;

    const handleWebSocketMessage = (message) => {
        if (!message || !message.topic || !message.data) {
            console.warn('Malformed message received:', message);
            return;
        }

        switch (message.topic) {
            case 'transcription.word.transcribed':
                setTranscription((prev) => prev + ' ' + message.data.word);
                break;
            default:
                console.warn('Unknown topic:', message.topic);
        }
    };

    const startTranscription = async () => {
        try {
            const response = await fetch('/api/startTranscription', { method: 'POST' });
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const data = await response.json();
            console.log('Started transcription:', data);
        } catch (err) {
            console.error('Error starting transcription:', err);
        }
    };

    return (
        <div>
            <h1>Transcription</h1>
            <p>{transcription}</p>
            <button onClick={startTranscription}>Start Transcription</button>
            <WebSocketComponent wsUrl={wsUrl} onMessage={handleWebSocketMessage} />
        </div>
    );
};

export default TranscriptionComponent;

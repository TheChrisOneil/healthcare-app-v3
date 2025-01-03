import React, { useState } from 'react';
import WebSocketComponent from './WebSocketComponent';

const TranscriptionComponent = () => {
    const [transcription, setTranscription] = useState('');
    const [highlightedWords, setHighlightedWords] = useState([]);
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss://' : 'ws://'}${window.location.host}/realtime/`;

    const handleWebSocketMessage = (message) => {
        if (!message || !message.topic || !message.data) {
            console.warn('Malformed message received:', message);
            return;
        }
        console.log('Handling WebSocket message:', message);
            

        switch (message.topic) {
            case 'transcription.word.transcribed':
                setTranscription((prev) => prev + ' ' + message.data.transcript);
                break;
            case 'aof.word.highlighted':
                setHighlightedWords((prev) => [...prev, message.data.highlightedWord]);
                break;    
            default:
                console.warn('Unknown topic:', message.topic);
        }
    };

    const controlTranscribeService = async (command, sessionData) => {
        try {
          const response = await fetch('/api/controlTranscribeService', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ command, sessionData }),
          });
      
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
      
          const data = await response.json();
          console.log(`${command} transcription:`, data);
        } catch (err) {
          console.error(`Error executing ${command} command:`, err);
        }
      };
    // Mock data for SessionInitiation
    const mockSessionData = {
        sessionId: "abc123",
        patientDID: "did:example:patient123",
        clinicianDID: "did:example:clinician456",
        clinicName: "Health Clinic",
        startTime: new Date(),
        audioConfig: {
            sampleRate: 16000,
            channels: 1,
            encoding: "pcm",
            languageCode: "en-US",
            },
        transcriptPreferences: {
            language: "en-US",
            autoHighlight: true,
            saveAudio: false,
        },
    };
    const startTranscription = () => controlTranscribeService('start', mockSessionData);
    const stopTranscription = () => controlTranscribeService('stop', mockSessionData);
    const pauseTranscription = () => controlTranscribeService('pause', mockSessionData);
    const resumeTranscription = () => controlTranscribeService('resume', mockSessionData);

    return (
        <div style={{ padding: '20px' }}>
            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                <button onClick={startTranscription} style={{ marginRight: '10px' }}>Start Transcription</button>
                <button onClick={pauseTranscription} style={{ marginRight: '10px' }}>Pause Transcription</button>
                <button onClick={resumeTranscription} style={{ marginRight: '10px' }}>Resume Transcription</button>
                <button onClick={stopTranscription}>Stop Transcription</button>
            </div>
            <WebSocketComponent wsUrl={wsUrl} onMessage={handleWebSocketMessage} />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px' }}>
                <div style={{ flex: 1, border: '1px solid #ccc', borderRadius: '5px', padding: '10px' }}>
                    <h2>Transcription Output</h2>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{transcription}</p>
                </div>
                <div style={{ flex: 1, border: '1px solid #ccc', borderRadius: '5px', padding: '10px' }}>
                    <h2>AOF Highlighted Words</h2>
                    <ul>
                        {highlightedWords.map((word, index) => (
                            <li key={index}>{word}</li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default TranscriptionComponent;

import React, { useState } from "react";
import WebSocketComponent from "./WebSocketComponent";

const TranscriptionComponent = () => {
    const [transcription, setTranscription] = useState("");
    const [highlightedChunks, setHighlightedChunks] = useState([]);
    const [legend, setLegend] = useState({});
    const [aggregatedDiagnosisData, setAggregatedDiagnosisData] = useState([]); // State for aggregated diagnosis data

    const wsUrl = `${
        window.location.protocol === "https:" ? "wss://" : "ws://"
    }${window.location.host}/realtime/`;

    const predefinedColors = [
        "#FF0000",
        "#00FF00",
        "#0000FF",
        "#FFFF00",
        "#FF00FF",
        "#00FFFF",
        "#FFA500",
        "#800080",
        "#008080",
        "#FFC0CB",
        "#A52A2A",
        "#8B0000",
        "#FFD700",
        "#4B0082",
        "#000000",
        "#808080",
        "#FFFFFF",
        "#1E90FF",
        "#ADFF2F",
        "#DC143C",
    ];

    const getColorForLabel = (label) => {
        const hash = [...label].reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return predefinedColors[hash % predefinedColors.length];
    };

    const handleWebSocketMessage = (message) => {
        if (!message || !message.topic || !message.data) {
            console.warn("Malformed message received:", message);
            return;
        }
        console.log("Handling WebSocket message:", message);

        switch (message.topic) {
            case "transcription.word.transcribed":
                setTranscription((prev) => prev + " " + message.data.transcript);
                break;
            case "aof.word.highlighted":
                processHighlightedWords(message.data.highlightedWord);
                break;
            case "diagnosis.text.processed": // New case for diagnosis data
            if (
                message.data &&
                Array.isArray(message.data)
            ) {
                console.log("Aggregated diagnosis data:", message.datat);
                setAggregatedDiagnosisData(message.data);
            } else {
                console.warn("Expected an array for aggregatedDiagnosisData:", message.data);
                setAggregatedDiagnosisData([]);
            }
            break;
            default:
                console.warn("Unknown topic:", message.topic);
        }
    };

    const processHighlightedWords = (highlightedWords) => {
        highlightedWords.forEach((wordData) => {
            wordData.analysis.forEach((chunk) => {
                setHighlightedChunks((prev) => [
                    ...prev,
                    {
                        chunk: chunk.chunk,
                        scores: chunk.scores,
                    },
                ]);
                chunk.scores.forEach((score) => {
                    setLegend((prev) => ({
                        ...prev,
                        [score.label]: getColorForLabel(score.label),
                    }));
                });
            });
        });
    };

    const renderHighlightedText = () => {
        return highlightedChunks.map((chunkData, index) => {
            const { chunk, scores } = chunkData;
            const topScore = scores.reduce((a, b) => (a.score > b.score ? a : b), scores[0]);
            const style = {
                backgroundColor: legend[topScore.label] || "#ccc",
                padding: "2px",
                margin: "2px",
                lineHeight: "1.5",
                cursor: "help",
            };
            const tooltip = `${topScore.label}: ${topScore.score.toFixed(2)}`;
            return (
                <span key={index} style={style} title={tooltip}>
                    {chunk}
                </span>
            );
        });
    };

    const renderLegend = () => {
        return Object.entries(legend).map(([label, color]) => (
            <li key={label} style={{ listStyle: "none" }}>
                <span
                    style={{
                        display: "inline-block",
                        width: "15px",
                        height: "15px",
                        backgroundColor: color,
                        marginRight: "5px",
                    }}
                ></span>
                {label}
            </li>
        ));
    };

    const renderAggregatedDiagnosisData = () => {
        if (!Array.isArray(aggregatedDiagnosisData) || aggregatedDiagnosisData.length === 0) {
            return <p>No diagnosis data available.</p>;
        }
        return (
            <table className="table" style={{ width: "100%", marginTop: "20px" }}>
                <thead>
                    <tr>
                        <th>Category</th>
                        <th>Attributes</th>
                    </tr>
                </thead>
                <tbody>
                    {aggregatedDiagnosisData.map((row, index) => (
                        <tr key={index}>
                            <td>{row.category || "N/A"}</td>
                            <td>
                                {row.attributes || "No attributes available"}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    };

    const controlTranscribeService = async (command, sessionData) => {
        try {
            const response = await fetch("/api/controlTranscribeService", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
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
            showSpeakerLabels: true,
        },
    };

    const startTranscription = () => controlTranscribeService("start", mockSessionData);
    const stopTranscription = () => controlTranscribeService("stop", mockSessionData);
    const pauseTranscription = () => controlTranscribeService("pause", mockSessionData);
    const resumeTranscription = () => controlTranscribeService("resume", mockSessionData);

    return (
        <div style={{ padding: "20px" }}>
            <div style={{ marginBottom: "20px", textAlign: "center" }}>
                <button onClick={startTranscription} style={{ marginRight: "10px" }}>
                    Start Transcription
                </button>
                <button onClick={pauseTranscription} style={{ marginRight: "10px" }}>
                    Pause Transcription
                </button>
                <button onClick={resumeTranscription} style={{ marginRight: "10px" }}>
                    Resume Transcription
                </button>
                <button onClick={stopTranscription}>Stop Transcription</button>
            </div>
            <WebSocketComponent wsUrl={wsUrl} onMessage={handleWebSocketMessage} />
            <div style={{ display: "flex", justifyContent: "space-between", gap: "20px" }}>
                <div style={{ flex: 1, border: "1px solid #ccc", borderRadius: "5px", padding: "10px" }}>
                    <h2>Transcription Output</h2>
                    <p style={{ whiteSpace: "pre-wrap" }}>{transcription}</p>
                </div>
                <div style={{ flex: 1, border: "1px solid #ccc", borderRadius: "5px", padding: "10px" }}>
                    <h2>Highlighted Words</h2>
                    <div>{renderHighlightedText()}</div>
                </div>
            </div>
            <div style={{ marginTop: "20px", border: "1px solid #ccc", borderRadius: "5px", padding: "10px" }}>
                <h2>Legend</h2>
                <ul>{renderLegend()}</ul>
            </div>
            <div style={{ marginTop: "20px", border: "1px solid #ccc", borderRadius: "5px", padding: "10px" }}>
                <h2>Entities Diagnosis Data</h2>
                {renderAggregatedDiagnosisData()}
            </div>
        </div>
    );
};

export default TranscriptionComponent;
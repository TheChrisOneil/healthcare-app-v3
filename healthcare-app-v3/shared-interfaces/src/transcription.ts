export interface TranscriptionEvent {
    sessionId: string;
  }
  
  export interface TranscriptResult {
    IsPartial: boolean;
    Alternatives?: { Transcript: string }[];
  }
  
  export interface TranscriptEvent {
    Transcript?: { Results: TranscriptResult[] };
  }
  
  export interface TranscriptResponse {
    TranscriptResultStream?: AsyncIterable<TranscriptEvent>;
  }
  
  export interface TranscriptionError {
    sessionId: string | null;
    patientDID?: string;
    clinicianDID?: string;
    error: string;
    timestamp: string;
    stack?: string;
    metadata?: Record<string, unknown>;
  }
  
  export interface TranscriptionWord {
    sessionId: string | null;
    word: string;
    timestamp: string;
    patientDID: string | null;
    clinicianDID: string | null;
    wordOffset: number;
  }

  export interface AudioChunk {
    type: string;
    sessionId: string;          // Reference to session
    timestamp: Date;           // Timestamp of this chunk
    audioData: JsonEncodedAudioData;    // Raw audio data
    sequence: number;          // Sequence number for ordering
    audioConfig: AudioConfig;   // Audio configuration
    transcriptPreferences: TranscriptPreferences;   // User preferences
}

  export interface JsonEncodedAudioData {
    type: string;
    data: number[];
  }

  export interface SessionControl {
    sessionId: string;          // Reference to session
    action: 'pause' | 'resume' | 'stop' | 'restart';
    timestamp: Date;           // When the control action occurred
    reason?: string;           // Optional reason for the action
}

 export interface SessionInitiation {
  sessionId: string;           // Unique session identifier
  patientDID: string;         // Patient's DID
  clinicianDID: string;       // Clinician's DID
  clinicName: string;         // Name of clinic
  startTime: Date;            // Session start timestamp
  audioConfig: AudioConfig;   // Audio configuration
  transcriptPreferences: TranscriptPreferences;   // User preferences
 };
 export interface AudioConfig {
    sampleRate: number;     // Audio sample rate (e.g., 44100)
    channels: number;       // Number of audio channels
    encoding: string;       // Audio encoding format
    languageCode: string;   // Language code for speech recognition
};
 export interface TranscriptPreferences {
      language: string;       // Preferred language for transcription
      autoHighlight: boolean; // Whether to auto-highlight recognized terms
      saveAudio: boolean;     // Whether to persist audio recording
      showSpeakerLabel?: boolean; // Enable speaker diarization
  };

// Transcription document
export interface TranscriptionDocument {
  sessionData: SessionInitiation;          // Reference to session
  transcript: TranscriptionChunk[];         // Full transcription
};

// Real-time chunk output
export interface TranscriptionChunk {
  sessionId: string;          // Reference to session
  sequence: number;           // Sequence number for ordering
  timestamp: Date;            // When this chunk was transcribed
  transcript: string;         // Transcribed text
  words: Transcribed[];       // String of transcribed words
  confidence: number;         // Confidence score of transcription
  metadata: {
      wordCount: number;      // Number of words in chunk
      hasCorrections: boolean;// Whether chunk contains corrections
      chunkOffset: number;    // Starting offset in full transcription
  };
}

export interface Transcribed {
  word?: string;               // Transcribed word
  start: number;              // Start time in seconds
  end: number;                // End time in seconds
  confidence: number;         // Confidence score
  speaker?: string;           // Speaker identifier if available
  metadata: {
      wordOffset?: number;     // Offset in full transcription
      hasCorrections?: boolean;// Whether word has corrections
  };
}

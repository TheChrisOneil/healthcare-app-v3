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
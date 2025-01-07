import { processDiagnosisStream } from "./processDiagnosisStream";
import { DiagnosisStream } from "./types";

// Example input data
const dataStream: DiagnosisStream = {
  "0": {
    $metadata: {
      httpStatusCode: 200,
      requestId: "example-id",
      attempts: 1,
      totalRetryDelay: 0,
    },
    Entities: [
      {
        BeginOffset: 0,
        EndOffset: 5,
        Id: 1,
        Score: 0.9,
        Text: "Example",
        Category: "MEDICAL_CONDITION",
        Type: "DX_NAME",
        Traits: [
          { Name: "SYMPTOM", Score: 0.95 },
          { Name: "HYPOTHETICAL", Score: 0.85 },
        ],
        Attributes: [
          {
            BeginOffset: 10,
            EndOffset: 15,
            Id: 2,
            Score: 0.85,
            Text: "Attribute Text",
            Category: "ANATOMY",
            Type: "SYSTEM_ORGAN_SITE",
            Traits: [],
            RelationshipType: "OVERLAP",
            RelationshipScore: 0.75,
          },
        ],
      },
    ],
    UnmappedAttributes: [],
  },
};

// Process the data stream
const processedData = processDiagnosisStream(dataStream);
console.log(JSON.stringify(processedData, null, 2));
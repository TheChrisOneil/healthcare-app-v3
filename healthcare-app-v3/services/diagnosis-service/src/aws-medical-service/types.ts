export type Metadata = {
    httpStatusCode: number;
    requestId: string;
    attempts: number;
    totalRetryDelay: number;
  };
  
  export type Trait = {
    Name: string;
    Score: number;
  };
  
  export type Attribute = {
    BeginOffset: number;
    EndOffset: number;
    Id: number;
    Score: number;
    Text: string;
    Category: string;
    Type: string;
    Traits: Trait[];
    RelationshipType?: string;
    RelationshipScore?: number;
  };
  
  export type Entity = {
    BeginOffset: number;
    EndOffset: number;
    Id: number;
    Score: number;
    Text: string;
    Category: string;
    Type: string;
    Traits: Trait[];
    Attributes?: Attribute[];
  };
  
  export type UnmappedAttribute = {
    Attribute: Attribute;
    Type: string;
  };
  
  export type DiagnosisEntry = {
    $metadata: Metadata;
    Entities: Entity[];
    UnmappedAttributes: UnmappedAttribute[];
  };
  
  export type DiagnosisStream = Record<string, DiagnosisEntry>;
  
  export type Relationship = {
    relatedText: string;
    relationshipType?: string;
    relationshipScore?: number;
  };
  
  export type ProcessedEntity = {
    text: string;
    category: string;
    type: string;
    score: number;
    traits: {
      name: string;
      confidence: number;
    }[];
    relationships: Relationship[];
  };
  
  export type ProcessedResult = {
    id: string;
    metadata: Metadata;
    entities: ProcessedEntity[];
    unmappedAttributes: UnmappedAttribute[];
  };
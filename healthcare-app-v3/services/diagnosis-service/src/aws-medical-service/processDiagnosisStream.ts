import {
    DiagnosisStream,
    ProcessedResult,
    ProcessedEntity,
  } from "./types";
  
  /**
   * Processes a diagnosis data stream, filtering low-confidence entities
   * and flattening relationships.
   *
   * @param data - The diagnosis data stream to process.
   * @returns An array of processed results.
   */
  export const processDiagnosisStream = (
    data: DiagnosisStream
  ): ProcessedResult[] => {
    return Object.keys(data).map((key) => {
      const entry = data[key];
  
      // Process entities with a score filter
      const entities: ProcessedEntity[] = entry.Entities
        ? entry.Entities.filter((entity) => entity.Score >= 0.7).map((entity) => ({
            text: entity.Text,
            category: entity.Category,
            type: entity.Type,
            score: entity.Score,
            traits: entity.Traits.map((trait) => ({
              name: trait.Name,
              confidence: trait.Score,
            })),
            relationships: entity.Attributes?.map((attr) => ({
              relatedText: attr.Text,
              relationshipType: attr.RelationshipType,
              relationshipScore: attr.RelationshipScore,
            })) || [],
          }))
        : [];
  
      // Include unmapped attributes if present
      const unmappedAttributes = entry.UnmappedAttributes || [];
  
      return {
        id: key,
        metadata: entry.$metadata,
        entities,
        unmappedAttributes,
      };
    });
  };
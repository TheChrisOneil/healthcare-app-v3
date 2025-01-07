type Entity = {
    BeginOffset: number;
    Category: string;
    EndOffset: number;
    Id: number;
    Score: number;
    Text: string;
    Traits?: { Name: string; Score: number }[];
    Type: string;
    Attributes?: {
      BeginOffset: number;
      Category: string;
      EndOffset: number;
      Id: number;
      RelationshipScore?: number;
      RelationshipType?: string;
      Score: number;
      Text: string;
      Traits?: { Name: string; Score: number }[];
      Type: string;
    }[];
  };
  
  type DetectEntitiesV2Response = {
    Entities: Entity[];
    ModelVersion: string;
  };
  
  type AggregatedData = {
    category: string;
    attributes: string;
  };
  
//   export const aggregateEntitiesByCategory = (responses: DetectEntitiesV2Response[]): AggregatedData[] => {

//     // const categoryMap: Record<string, Set<string>> = {};
  
//     // responses.forEach((response) => {
//     //   response.Entities.forEach((entity) => {
//     //     const { Category, Text, Attributes } = entity;
  
//     //     // Initialize the category in the map if not already present
//     //     if (!categoryMap[Category]) {
//     //       categoryMap[Category] = new Set();
//     //     }
  
//     //     // Add the entity's text to the category's attributes
//     //     categoryMap[Category].add(Text);
  
//     //     // Add attributes' text (if any) to the category
//     //     if (Attributes) {
//     //       Attributes.forEach((attribute) => {
//     //         categoryMap[attribute.Category]?.add(attribute.Text) || categoryMap[Category].add(attribute.Text);
//     //       });
//     //     }
//     //   });
//     // });
  
//     // // Transform the category map into a table-ready format
//     // return Object.entries(categoryMap).map(([category, attributes]) => ({
//     //   category,
//     //   attributes: Array.from(attributes).join(", "),
//     // }));

//     const categoryMap: Record<string, Set<string>> = {};

//     responses.forEach((response) => {
//         response.Entities.forEach((entity) => {
//             const { Category, Text, Attributes } = entity;

//             // Initialize the category in the map if not already present
//             if (!categoryMap[Category]) {
//                 categoryMap[Category] = new Set();
//             }

//             // Add the entity's text to the category's attributes
//             categoryMap[Category].add(Text);

//             // Add attributes' text (if any) to the category
//             if (Attributes) {
//                 Attributes.forEach((attribute) => {
//                     if (attribute.Category && categoryMap[attribute.Category]) {
//                         categoryMap[attribute.Category].add(attribute.Text);
//                     } else {
//                         categoryMap[Category].add(attribute.Text);
//                     }
//                 });
//             }
//         });
//     });

//     // Convert the categoryMap into a single array of AggregatedData objects
//     const aggregatedData: AggregatedData[] = Object.entries(categoryMap).map(([category, attributes]) => ({
//         category,
//         attributes: Array.from(attributes), // Convert Set to array
//     }));

//     return aggregatedData; // Single flattened array
//   };


export const aggregateEntitiesByCategory = (responses: DetectEntitiesV2Response[]): AggregatedData[] => {
    const categoryMap: Record<string, Set<string>> = {};

    responses.forEach((response) => {
        response.Entities.forEach((entity) => {
            const { Category, Text, Attributes } = entity;

            // Ensure Category exists
            if (!Category || !Text) return;

            // Initialize the category in the map if not already present
            if (!categoryMap[Category]) {
                categoryMap[Category] = new Set();
            }

            // Add the entity's text to the category's attributes
            categoryMap[Category].add(Text);

            // Add attributes' text (if any) to the category
            if (Attributes && Array.isArray(Attributes)) {
                Attributes.forEach((attribute) => {
                    if (attribute.Text) {
                        if (attribute.Category && categoryMap[attribute.Category]) {
                            categoryMap[attribute.Category].add(attribute.Text);
                        } else {
                            categoryMap[Category].add(attribute.Text);
                        }
                    }
                });
            }
        });
    });

    // Convert the categoryMap into a single array of AggregatedData objects
    const aggregatedData: AggregatedData[] = Object.entries(categoryMap).map(([category, attributes]) => ({
        category,
        attributes: Array.from(attributes).join(", "), // Join attributes into a single string
    }));

    return aggregatedData; // Single flattened array
};
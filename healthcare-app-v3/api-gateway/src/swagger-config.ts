import { OpenAPIV3 } from "openapi-types";

const swaggerJsDoc = require("swagger-jsdoc");

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "API Gateway",
      version: "1.0.0",
      description: "API documentation for the API Gateway",
    },
    servers: [
      {
        url: "http://localhost", 
        description: "Local server",
      },
    ],
  },
  apis: ["./src/**/*.ts"], // Match your API route files for annotations
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);

export default swaggerDocs;
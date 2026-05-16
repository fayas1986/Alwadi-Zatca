import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ZATCA Enterprise API V2',
      version: '2.0.0',
      description: 'The final Enterprise ZATCA API with HMAC Auth, Async Webhooks, and SaaS Scale Architecture.\n\n### 🚀 Postman Resources\nDownload the following files to start testing immediately:\n- [Master Postman Collection](/exports/postman_collection_v4_master.json)\n- [Live Postman Collection](/exports/postman_collection_live.json)\n- [Simulation Environment](/exports/postman_environment_simulation.json)\n- [Live Environment](/exports/postman_environment_live.json)',
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./server/src/index.ts', './server/src/routes/*.ts'], // Scan for JSDoc in routes
};

export const swaggerSpec = swaggerJsdoc(options);

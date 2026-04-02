import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ZATCA Enterprise API V2',
      version: '2.0.0',
      description: 'The final Enterprise ZATCA API with HMAC Auth, Async Webhooks, and SaaS Scale Architecture.',
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

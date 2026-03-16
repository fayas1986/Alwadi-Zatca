import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ZATCA Connect API',
      version: '1.0.0',
      description: 'API documentation for ZATCA Connect - E-Invoicing and Compliance Platform',
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

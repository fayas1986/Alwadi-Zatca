import React from 'react';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';

const ApiDocs: React.FC = () => {
  return (
    <div className="api-docs-container" style={{ backgroundColor: '#fff', minHeight: '100vh', padding: '20px' }}>
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ color: '#1a365d', margin: 0 }}>API Documentation</h1>
        <div style={{ padding: '8px 16px', backgroundColor: '#ebf8ff', color: '#2b6cb0', borderRadius: '6px', fontSize: '14px', fontWeight: 500 }}>
          ZATCA Connect OpenAPI 3.0
        </div>
      </div>
      
      <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
        <SwaggerUI 
          url="/api/api-docs.json" 
          docExpansion="list"
          defaultModelsExpandDepth={-1}
          persistAuthorization={true}
        />
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .api-docs-container .swagger-ui .topbar { display: none; }
        .api-docs-container .swagger-ui .info { margin: 20px 0; }
        .api-docs-container .swagger-ui .scheme-container { 
          background: #f8fafc; 
          padding: 20px;
          margin-bottom: 20px;
          border-radius: 8px;
        }
        .api-docs-container .swagger-ui .opblock {
          border-radius: 8px;
          box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
        }
      `}} />
    </div>
  );
};

export default ApiDocs;

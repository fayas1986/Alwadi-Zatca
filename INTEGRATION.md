# ERP Integration Guide

This document outlines the three stages of ERP integration for the EasyLease Tax application.

## Integration Stages

| Stage | Environment | Description | ZATCA Endpoint |
|-------|-------------|-------------|----------------|
| **Simulation** | `SIMULATION` | Internal testing and development. | `https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation` |
| **Sandbox** | `SANDBOX` | Developer portal for compliance testing. | `https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal` |
| **Production** | `PRODUCTION` | Live production environment. | `https://gw-fatoora.zatca.gov.sa/e-invoicing/core` |

## Authentication (HMAC-SHA256)

All requests from your ERP to our API must be signed using HMAC-SHA256 to ensure data integrity and authenticity.

### Required Headers

*   `x-api-key`: Your unique connector API Key.
*   `x-signature`: The generated HMAC-SHA256 signature.
*   `x-timestamp`: The current UTC timestamp (ISO 8601).
*   `x-nonce`: A unique random string for the request.
*   `Authorization`: `Bearer <API_KEY>` (Legacy support).

### Signature Calculation

1.  **Body Hash**: Calculate SHA256 of the JSON body (using stable stringification).
2.  **String to Sign**: `Timestamp + Nonce + Method + Path + BodyHash`
3.  **HMAC**: Calculate HMAC-SHA256 of the String to Sign using your **API Key** as the secret.

## D365 Integration Setup

For Dynamics 365 customers, follow these steps to authorize the application:

1.  **Azure App Registration**: Register the "ZatcaConnect" application in your Azure AD tenant.
2.  **Permissions**: Grant `OData.FullAccess` or equivalent to the Microsoft Dynamics ERP API.
3.  **D365 Configuration**: 
    *   Navigate to **System Administration > Setup > Microsoft Entra ID applications**.
    *   Add the Client ID: `5c8bda30-cff4-4306-a6ef-a94de2ee1162`.
    *   Link it to a user with appropriate permissions to post invoices.

## Testing with the Simulator

The **ERP Integration Hub** includes a built-in simulator. You can:
1.  Select an active connector (Simulation, Sandbox, or Production).
2.  Load a template (B2B or B2C).
3.  Test the end-to-end flow from ERP push to ZATCA response.

---
**Note**: Ensure your `api_key` is kept secure and never exposed in client-side code (except for the simulator itself which is restricted to authorized admins).

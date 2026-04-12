# Technology Stack - EasyLease-TaxFilling

Summary of the core technologies, frameworks, and dependencies used in this project.

## Core Runtime & Frameworks
- **Runtime**: Node.js
- **Frontend Framework**: React 19 (Vite-powered)
- **Backend Framework**: Express 5.x
- **Language**: TypeScript
- **Database ORM**: Prisma 6.x
- **Styling**: Tailwind CSS 4.x

## Frontend Stack
- **Build Tool**: Vite 6.x
- **UI Components**: Custom components with Lucide React icons
- **State Management**: React Hooks (useState, useEffect)
- **Data Fetching**: Axios
- **Visualization**: Recharts
- **PDF/Media Generation**:
    - `jspdf` & `jspdf-autotable`
    - `html2canvas`
    - `qrcode.react`

## Backend Stack
- **Server**: Express.js
- **Security**: 
    - `helmet` (Security headers)
    - `cors` (Cross-origin resource sharing)
- **Documentation**: Swagger (JSDoc + UI)
- **Cryptography**:
    - `node-forge`
    - `elliptic`
    - `js-sha256`
- **Domain Logic**: XML generation with `xmlbuilder2`

## Data Layer
- **Database**: PostgreSQL (Prisma)
- **Environment**: Managed (likely Neon/Vercel Postgres)

## Configuration
- **Frontend Config**: `vite.config.ts` (proxies `/api` to `:3001`)
- **backend Config**: `.env` and `server/src/index.ts`
- **TypeScript**: `tsconfig.json` (root)

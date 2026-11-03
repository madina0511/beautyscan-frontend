# BeautyScan AI — Frontend

BeautyScan AI is an AI-powered web application designed to help cosmetics sellers, online shop owners, and content creators prepare professional product images and multilingual product descriptions.

This repository contains the **frontend application**, built with Next.js and TypeScript.

## Features

### AI Product Photo Studio
- Upload cosmetics product images.
- Remove image backgrounds using the Photoroom API through the backend.
- Preview processed images.
- Access protected downloads and saved results after authentication.

### AI Product Description Generator
- Upload product packaging images.
- Extract packaging information using Google Cloud Vision OCR through the backend.
- Generate product descriptions using AI.
- Support four languages:
  - Uzbek
  - English
  - Korean
  - Russian
- Copy generated descriptions.

### Authentication & User Dashboard
- User registration and login.
- Guest trial experience.
- Protected user features.
- Product history and saved results in My Page.

## Tech Stack

| Technology | Purpose |
|---|---|
| Next.js | Frontend framework |
| React | User interface |
| TypeScript | Type-safe development |
| CSS | Styling |
| GraphQL / HTTP APIs | Backend communication |

## Project Structure

```text
src/
├── app/          # Pages and routes
├── components/   # Reusable UI components
└── ...           # Application utilities and services

tests/            # Frontend tests
```

## Getting Started

### Prerequisites

- Node.js 24 LTS
- npm
- BeautyScan AI backend running locally

### Installation

```bash
git clone https://github.com/madina0511/beautyscan-frontend.git
cd beautyscan-frontend
npm ci
```

Configure the required environment variables using your local development settings. Never commit real API keys or credentials.

### Start Development Server

```bash
npm run dev
```

Open the local URL shown in the terminal.

### Production Build

```bash
npm run build
npm run start
```

## Testing

```bash
npm test
npm run lint
npx tsc --noEmit
```

Available scripts should be checked against `package.json`.

## Backend Repository

[BeautyScan AI Backend](https://github.com/madina0511/beautyscan-backend)

The backend is responsible for authentication, product management, image processing integrations, OCR, AI description generation, and protected media access.

## Project Status

**Active development — preparing for production deployment.**

Planned improvements include production hosting, HTTPS configuration, API usage controls, and watermark-free image processing through an appropriate production API plan.

## Author

**Madina Burieva**

Full-Stack Developer

GitHub: [madina0511](https://github.com/madina0511)

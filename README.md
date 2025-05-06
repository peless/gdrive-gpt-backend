# Google Drive Latest PDF API

A Node.js Express backend that fetches the most recently modified PDF file from Google Drive.

## Features

- Single endpoint `/files/latest` to get the latest PDF file
- Google Drive API integration
- OAuth2 authentication
- Returns file name, modification time, and web view link

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file (optional):
```
PORT=3000
```

3. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## API Usage

Make a GET request to `/files/latest` with a Google OAuth2 token:

```bash
curl -H "Authorization: Bearer YOUR_GOOGLE_OAUTH2_TOKEN" http://localhost:3000/files/latest
```

Response format:
```json
{
  "fileName": "example.pdf",
  "modifiedTime": "2024-03-14T12:00:00.000Z",
  "link": "https://drive.google.com/file/d/..."
}
```

## Deployment

This project is configured for deployment on Vercel. The `vercel.json` file contains the necessary configuration. 
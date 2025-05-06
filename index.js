require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();
const port = process.env.PORT || 3000;

// Debug: Log environment variables
console.log('Environment variables:', {
  CLIENT_ID: process.env.CLIENT_ID,
  CLIENT_SECRET: process.env.CLIENT_SECRET ? 'Set' : 'Not set',
  BASE_URL: process.env.BASE_URL || 'https://gdrive-gpt-backend.vercel.app',
  REDIRECT_URI: process.env.REDIRECT_URI || 'https://chat.openai.com/auth/callback'
});

// Verify required environment variables
if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
  console.error('Missing required environment variables:');
  if (!process.env.CLIENT_ID) console.error('- CLIENT_ID is not set');
  if (!process.env.CLIENT_SECRET) console.error('- CLIENT_SECRET is not set');
  process.exit(1);
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    details: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Google OAuth2 Configuration
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI || 'https://chat.openai.com/auth/callback'
);

// Initialize Google Drive API
const drive = google.drive('v3');

// Swagger definition
const swaggerOptions = {
  definition: {
    openapi: '3.1.0',
    info: {
      title: 'Drive GPT Backend API',
      version: '1.0.0',
      description: 'API for fetching the latest PDF file from Google Drive',
    },
    servers: [
      {
        url: process.env.BASE_URL || 'https://gdrive-gpt-backend.vercel.app',
        description: 'Production server',
      },
    ],
    components: {
      schemas: {
        LatestPDFResponse: {
          type: 'object',
          properties: {
            fileName: {
              type: 'string',
              description: 'Name of the PDF file'
            },
            modifiedTime: {
              type: 'string',
              format: 'date-time',
              description: 'Last modification time of the file'
            },
            link: {
              type: 'string',
              format: 'uri',
              description: 'Web view link to the file'
            }
          },
          required: ['fileName', 'modifiedTime', 'link']
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message'
            },
            details: {
              type: 'string',
              description: 'Detailed error information'
            }
          },
          required: ['error']
        },
        AuthResponse: {
          type: 'object',
          properties: {
            access_token: {
              type: 'string',
              description: 'OAuth2 access token'
            }
          },
          required: ['access_token']
        }
      },
      securitySchemes: {
        OAuth2: {
          type: 'oauth2',
          flows: {
            authorizationCode: {
              authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
              tokenUrl: 'https://oauth2.googleapis.com/token',
              scopes: {
                'https://www.googleapis.com/auth/drive.readonly': 'Read-only access to Google Drive files'
              }
            }
          }
        }
      }
    },
    security: [{
      OAuth2: ['https://www.googleapis.com/auth/drive.readonly']
    }]
  },
  apis: ['./index.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

/**
 * @swagger
 * /auth/init:
 *   get:
 *     summary: Initialize Google OAuth2 flow
 *     description: Redirects to Google's consent screen to authorize Drive access
 *     responses:
 *       302:
 *         description: Redirect to Google's consent screen
 */
app.get('/auth/init', (req, res) => {
  try {
    // Debug: Log OAuth2 client configuration
    console.log('OAuth2 Client Config:', {
      clientId: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET ? 'Set' : 'Not set',
      redirectUri: process.env.REDIRECT_URI || 'https://chat.openai.com/auth/callback',
      baseUrl: process.env.BASE_URL
    });

    if (!process.env.CLIENT_ID) {
      console.error('CLIENT_ID is not set in environment variables');
      return res.status(500).json({ error: 'OAuth configuration error: CLIENT_ID is not set' });
    }

    // Construct the authorization URL manually with explicit flow type
    const params = new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      redirect_uri: process.env.REDIRECT_URI || 'https://chat.openai.com/auth/callback',
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      access_type: 'offline',
      prompt: 'consent',
      flowName: 'GeneralOAuthFlow',
      include_granted_scopes: 'true'
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    // Debug: Log the generated auth URL and parameters
    console.log('Generated Auth URL:', authUrl);
    console.log('URL Parameters:', Object.fromEntries(params.entries()));
    console.log('Raw client_id value:', process.env.CLIENT_ID);
    console.log('Raw redirect_uri value:', process.env.REDIRECT_URI || 'https://chat.openai.com/auth/callback');

    // Redirect to Google's consent screen
    res.redirect(authUrl);
  } catch (error) {
    console.error('Error in /auth/init:', error);
    res.status(500).json({
      error: 'Failed to initialize OAuth flow',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * @swagger
 * /auth/callback:
 *   get:
 *     summary: OAuth2 callback endpoint
 *     description: Handles the OAuth2 callback from Google and exchanges code for token
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully obtained access token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Missing authorization code
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error exchanging code for token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  try {
    // Exchange the authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    // Return the access token
    res.json({ access_token: tokens.access_token });
  } catch (error) {
    console.error('Error exchanging code for token:', error);
    res.status(500).json({
      error: 'Failed to exchange authorization code',
      details: error.message
    });
  }
});

// Middleware to verify token from query param or cookie
const verifyToken = (req, res, next) => {
  const token = req.query.token || req.cookies?.token;
  
  if (!token) {
    return res.status(401).json({ error: 'Access token is required' });
  }
  
  // Set the token for the OAuth2 client
  oauth2Client.setCredentials({ access_token: token });
  next();
};

/**
 * @swagger
 * /api/getLatestDriveFile:
 *   get:
 *     summary: Get the most recently modified PDF file from Google Drive
 *     operationId: getLatestDriveFile
 *     parameters:
 *       - in: query
 *         name: token
 *         schema:
 *           type: string
 *         description: OAuth2 access token
 *     responses:
 *       200:
 *         description: Successfully retrieved the latest PDF file
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LatestPDFResponse'
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: No PDF files found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Server error while fetching the file
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
const getLatestPDF = async (req, res) => {
  try {
    // Query Google Drive for PDF files, ordered by modified time
    const response = await drive.files.list({
      auth: oauth2Client,
      q: "mimeType='application/pdf'",
      orderBy: 'modifiedTime desc',
      pageSize: 1,
      fields: 'files(id, name, modifiedTime, webViewLink)'
    });

    const files = response.data.files;

    if (!files || files.length === 0) {
      return res.status(404).json({ error: 'No PDF files found' });
    }

    // Return the most recent PDF file details
    const latestFile = files[0];
    res.json({
      fileName: latestFile.name,
      modifiedTime: latestFile.modifiedTime,
      link: latestFile.webViewLink
    });

  } catch (error) {
    console.error('Error fetching file:', error);
    res.status(500).json({ 
      error: 'Failed to fetch file',
      details: error.message 
    });
  }
};

// Register endpoints
app.get('/api/getLatestDriveFile', verifyToken, getLatestPDF);

// Swagger UI setup
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/docs-json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`API Documentation available at http://localhost:${port}/docs`);
}); 
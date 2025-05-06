require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();
const port = process.env.PORT || 3000;

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
        url: 'https://gdrive-gpt-backend.vercel.app',
        description: 'Production server',
      },
    ],
    components: {
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
  apis: ['./index.js'], // Path to the API docs
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Initialize Google Drive API
const drive = google.drive('v3');

// Middleware to verify Authorization header
const verifyAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or invalid' });
  }
  
  // Extract the token from the Authorization header
  req.accessToken = authHeader.split(' ')[1];
  next();
};

/**
 * @swagger
 * /api/getLatestDriveFile:
 *   get:
 *     summary: Get the most recently modified PDF file from Google Drive
 *     operationId: getLatestDriveFile
 *     security:
 *       - OAuth2: ['https://www.googleapis.com/auth/drive.readonly']
 *     responses:
 *       200:
 *         description: Successfully retrieved the latest PDF file
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 fileName:
 *                   type: string
 *                   description: Name of the PDF file
 *                 modifiedTime:
 *                   type: string
 *                   format: date-time
 *                   description: Last modification time of the file
 *                 link:
 *                   type: string
 *                   format: uri
 *                   description: Web view link to the file
 *       401:
 *         description: Unauthorized - Invalid or missing authorization token
 *       404:
 *         description: No PDF files found
 *       500:
 *         description: Server error while fetching the file
 */
const getLatestPDF = async (req, res) => {
  try {
    // Set up the OAuth2 client with the provided token
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: req.accessToken });

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

// Register both endpoints with the same handler
app.get('/files/latest', verifyAuth, getLatestPDF);
app.get('/api/getLatestDriveFile', verifyAuth, getLatestPDF);

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
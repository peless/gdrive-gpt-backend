require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');

const app = express();
const port = process.env.PORT || 3000;

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

// Function to handle fetching the latest PDF file
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

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 
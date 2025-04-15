import {
  parseCSV,
  parseExcel,
  generateCSV,
  generateExcel,
  processFileContent
} from '../services/analyzeService.js';

// In-memory storage for uploaded files
const uploadedFiles = new Map();

// Render the file upload page
export function renderFileUploadPage(req, res) {
  res.render('analyzer', {
    title: 'Analyze Reviews from File',
    page: 'analyzer'
  });
}

// Handle file upload and preview
export async function handleFileUpload(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileBuffer = req.file.buffer;
    const fileType = req.file.mimetype;
    let rows = [];

    if (fileType === 'text/csv' || req.file.originalname.endsWith('.csv')) {
      rows = await parseCSV(fileBuffer);
    } else if (fileType.includes('spreadsheet') || req.file.originalname.endsWith('.xlsx')) {
      rows = await parseExcel(fileBuffer);
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No data found in file' });
    }

    const columns = Object.keys(rows[0]);
    
    // Generate a unique ID for the file
    const fileId = Date.now().toString();
    
    // Store the parsed data in memory
    uploadedFiles.set(fileId, {
      rows,
      filename: req.file.originalname,
      timestamp: Date.now()
    });
    
    // Clean up old uploads every hour (implement a cleanup mechanism)
    setTimeout(() => {
      if (uploadedFiles.has(fileId)) {
        uploadedFiles.delete(fileId);
      }
    }, 3600000); // 1 hour

    res.json({
      success: true,
      columns,
      preview: rows.slice(0, 10), // Only send preview rows
      totalRows: rows.length,
      filename: fileId, // Send the file ID instead of original filename
      fileContent: JSON.stringify(rows.slice(0, 10)) // Only send preview data
    });

  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ 
      error: 'Failed to process file',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
}

// Process the file with selected column
export async function processFileAnalysis(req, res) {
  try {
    const { filename, column } = req.body;

    if (!column || !filename) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    // Get the stored file data using the file ID
    const fileData = uploadedFiles.get(filename);
    if (!fileData) {
      return res.status(404).json({ error: 'File not found or expired. Please upload again.' });
    }
    
    const { rows, filename: originalFilename } = fileData;
    const processedRows = await processFileContent(rows, column);

    // Generate the output file
    let outputFile;
    if (originalFilename.endsWith('.csv')) {
      outputFile = await generateCSV(processedRows);
    } else {
      outputFile = await generateExcel(processedRows);
    }

    // Clean up the stored file data after processing
    uploadedFiles.delete(filename);

    res.json({
      success: true,
      filename: `analyzed_${originalFilename}`,
      file: outputFile.toString('base64'),
      total: processedRows.length
    });

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ 
      error: 'Failed to analyze file',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
}
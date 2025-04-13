import {
  parseCSV,
  parseExcel,
  generateCSV,
  generateExcel,
  processFileContent
} from '../services/analyzeService.js';

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

    res.json({
      success: true,
      columns,
      preview: rows,
      totalRows: rows.length,
      filename: req.file.originalname,
      fileContent: rows
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
    const { filename, column, fileContent } = req.body;

    if (!column || !fileContent) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const rows = JSON.parse(fileContent);
    const processedRows = await processFileContent(rows, column);

    // Generate the output file
    let outputFile;
    if (filename.endsWith('.csv')) {
      outputFile = await generateCSV(processedRows);
    } else {
      outputFile = await generateExcel(processedRows);
    }

    res.json({
      success: true,
      filename: `analyzed_${filename}`,
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
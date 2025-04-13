import express from 'express';
import { renderFileUploadPage, handleFileUpload, processFileAnalysis } from '../controllers/fileAnalysisController.js';
import upload from '../middlewares/uploadMiddleware.js';

const router = express.Router();

router.get('/analyzer', renderFileUploadPage);
router.post('/analyze/upload', upload.single('file'), handleFileUpload);
router.post('/analyze/process', processFileAnalysis);

export default router;
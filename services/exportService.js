import ExcelJS from 'exceljs';
import { format } from 'date-fns';

// Service function to generate Excel workbook
export async function generateReviewsExcel(reviews) {
  // Create a new workbook
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Reviews');
  
  // Define columns
  worksheet.columns = [
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Review', key: 'review', width: 50 },
    { header: 'Sentiment', key: 'sentiment', width: 15 },
    { header: 'Source', key: 'source', width: 15 }
  ];
  
  // Add rows
  reviews.forEach(review => {
    worksheet.addRow({
      date: format(new Date(review.time_published), 'yyyy-MM-dd'),
      review: review.review,
      sentiment: review.sentiment || 'Pending',
      source: review.source
    });
  });
  
  // Style header row
  worksheet.getRow(1).eachCell(cell => {
    cell.font = { bold: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' }
    };
  });
  
  return workbook;
}
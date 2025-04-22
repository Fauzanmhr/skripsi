import ExcelJS from 'exceljs';
import { format } from 'date-fns';

// Service function to generate Excel workbook
export async function generateReviewsExcel(reviews) {
  // Create a new workbook
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Ulasan');
  
  // Define columns
  worksheet.columns = [
    { header: 'Tanggal', key: 'date', width: 15 },
    { header: 'Ulasan', key: 'review', width: 50 },
    { header: 'Sentimen', key: 'sentiment', width: 15 }
  ];
  
  // Add rows
  reviews.forEach(review => {
    worksheet.addRow({
      date: format(new Date(review.time_published), 'yyyy-MM-dd'),
      review: review.review,
      sentiment: review.sentiment || 'Sedang Diproses'
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

/**
 * @fileoverview Utility function for exporting data to an Excel (.xlsx) file.
 * This module uses the 'xlsx' library (SheetJS) to create and download Excel files
 * on the client-side.
 */
'use client';

import * as XLSX from 'xlsx';

interface ExportToExcelOptions {
    fileName: string;
    sheetName?: string;
    headers: string[];
    data: (string | number | null | undefined)[][];
    columnWidths?: number[];
}

/**
 * Creates and downloads an Excel (.xlsx) file from the provided data.
 * 
 * @param {ExportToExcelOptions} options - The configuration for the Excel file.
 * @param {string} options.fileName - The name of the file to be downloaded (without extension).
 * @param {string[]} options.headers - An array of strings for the table headers.
 * @param {(string | number | null | undefined)[][]} options.data - A 2D array of data for the rows.
 * @param {string} [options.sheetName='Datos'] - The name of the worksheet.
 * @param {number[]} [options.columnWidths] - Optional array of widths for each column.
 */
export const exportToExcel = ({
    fileName,
    sheetName = 'Datos',
    headers,
    data,
    columnWidths,
}: ExportToExcelOptions) => {
    // Create a new workbook and a worksheet
    const workbook = XLSX.utils.book_new();
    
    // Add headers to the beginning of the data array
    const dataWithHeaders = [headers, ...data];

    // Create worksheet from the array of arrays
    const worksheet = XLSX.utils.aoa_to_sheet(dataWithHeaders);

    // Apply column widths if provided
    if (columnWidths) {
        worksheet['!cols'] = columnWidths.map(width => ({ wch: width }));
    }

    // Apply bold style to header row
    const headerCellStyle = { font: { bold: true } };
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
    for (let C = range.s.c; C <= range.e.c; ++C) {
        const address = XLSX.utils.encode_cell({ r: 0, c: C });
        if (!worksheet[address]) continue;
        worksheet[address].s = headerCellStyle;
    }

    // Append the worksheet to the workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    // Generate the .xlsx file and trigger the download
    XLSX.writeFile(workbook, `${fileName}_${new Date().getTime()}.xlsx`);
};

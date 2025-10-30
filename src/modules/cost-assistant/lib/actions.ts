/**
 * @fileoverview Server Actions for the Cost Assistant module.
 * These functions handle server-side logic like processing XML files,
 * interacting with the database, and generating export files.
 */
'use server';

import { XMLParser } from 'fast-xml-parser';
import type { CostAssistantLine, ProcessedInvoiceInfo, CostAnalysisDraft, CostAssistantSettings, DraftableCostAssistantLine } from '@/modules/core/types';
import { 
    getAllDrafts as getAllDraftsServer, 
    saveDraft as saveDraftServer, 
    deleteDraft as deleteDraftServer, 
    getCostAssistantDbSettings as getDbSettings,
    saveCostAssistantDbSettings as saveDbSettings,
} from './db';
import { logError, logInfo } from '@/modules/core/lib/logger';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { getUserPreferences, saveUserPreferences } from '@/modules/core/lib/db';

// Helper to get a value from a potentially nested object
const getValue = (obj: any, path: string[], defaultValue: any = '') => {
    return path.reduce((acc, key) => (acc && acc[key] !== undefined) ? acc[key] : defaultValue, obj);
};

const parseDecimal = (str: any): number => {
    if (str === null || str === undefined || str === '') return 0;
    const s = String(str).trim();
    
    // If a comma exists, it is the decimal separator. Remove dots, replace comma.
    if (s.includes(',')) {
        return parseFloat(s.replace(/\./g, '').replace(',', '.'));
    }
    
    // If no comma exists, treat as a standard float, respecting the dot as decimal separator
    return parseFloat(s);
};


interface InvoiceParseResult {
    lines: CostAssistantLine[];
    invoiceInfo: Omit<ProcessedInvoiceInfo, 'status' | 'errorMessage'>;
}

async function parseInvoice(xmlContent: string, fileIndex: number): Promise<InvoiceParseResult | { error: string, details: Partial<ProcessedInvoiceInfo> }> {
    
    if (xmlContent.includes('MensajeHacienda')) {
        return { error: 'El archivo es una respuesta de Hacienda, no una factura.', details: {} };
    }

    const parser = new XMLParser({
        ignoreAttributes: true,
        removeNSPrefix: true, 
        parseTagValue: false, 
        isArray: (tagName) => {
            const alwaysArray = ['LineaDetalle', 'CodigoComercial'];
            return alwaysArray.includes(tagName);
        },
    });

    let json;
    try {
        json = parser.parse(xmlContent);
    } catch (e: any) {
        logError('XML parsing failed', { error: e.message, content: xmlContent.substring(0, 500) });
        return { error: 'XML malformado o ilegible.', details: {} };
    }
    
    const rootNode = json.FacturaElectronica || json.TiqueteElectronico;
    
    if (!rootNode) {
        const detectedRoot = Object.keys(json)[0] || 'N/A';
        logError('Invalid XML structure for invoice', { detectedRoot });
        if (detectedRoot === 'html' || detectedRoot.startsWith('?xml')) {
            return { error: 'El archivo es un documento HTML o XML inválido, no una factura.', details: {} };
        }
        return { error: `No es un archivo de factura válido. Nodo raíz no encontrado: ${detectedRoot}`, details: {} };
    }
    
    const clave = getValue(rootNode, ['Clave'], `unknown-key-${fileIndex}`);
    const numeroConsecutivo = getValue(rootNode, ['NumeroConsecutivo'], clave.substring(21, 41));
    const fechaEmision = getValue(rootNode, ['FechaEmision'], new Date().toISOString());
    const emisorNombre = getValue(rootNode, ['Emisor', 'Nombre'], 'Desconocido');

    const invoiceInfo = {
        supplierName: emisorNombre,
        invoiceNumber: numeroConsecutivo,
        invoiceDate: fechaEmision,
    };

    const detalleServicio = getValue(rootNode, ['DetalleServicio']);
    if (!detalleServicio || !detalleServicio.LineaDetalle) {
        return { lines: [], invoiceInfo };
    }

    const lineasDetalle = Array.isArray(detalleServicio.LineaDetalle) ? detalleServicio.LineaDetalle : [detalleServicio.LineaDetalle];

    const moneda = getValue(rootNode, ['ResumenFactura', 'CodigoTipoMoneda', 'CodigoMoneda'], 'CRC');
    const tipoCambioStr = getValue(rootNode, ['ResumenFactura', 'CodigoTipoMoneda', 'TipoCambio'], '1');
    const tipoCambio = parseDecimal(tipoCambioStr) || 1.0;


    const lines: CostAssistantLine[] = [];
    for (const [index, linea] of lineasDetalle.entries()) {
        const cantidad = parseDecimal(getValue(linea, ['Cantidad'], '0'));
        if (cantidad === 0) continue;
        
        let supplierCode = 'N/A';
        let supplierCodeType = '04'; // Default to 'Uso Interno'
        const codigosComercialesRaw = linea.CodigoComercial || [];
        const codigosComerciales = Array.isArray(codigosComercialesRaw) ? codigosComercialesRaw : [codigosComercialesRaw];
        
        if (codigosComerciales.length > 0) {
            const preferredCodeNode = codigosComerciales.find((c: any) => c.Tipo === '01');
            if (preferredCodeNode && preferredCodeNode.Codigo) {
                supplierCode = preferredCodeNode.Codigo;
                supplierCodeType = preferredCodeNode.Tipo;
            } else if (codigosComerciales.length > 0 && codigosComerciales[0].Codigo) {
                supplierCode = codigosComerciales[0].Codigo;
                supplierCodeType = codigosComerciales[0].Tipo;
            }
        }
        
        const cabysV43 = getValue(linea, ['Codigo']);
        const cabysV44 = getValue(linea, ['CodigoCABYS']);
        const cabysCode = cabysV44 || cabysV43 || 'N/A';
        
        const montoTotalLinea = parseDecimal(getValue(linea, ['MontoTotalLinea'], '0'));
        
        const descuentoNode = getValue(linea, ['Descuento']);
        const discountAmount = descuentoNode ? parseDecimal(getValue(descuentoNode, ['MontoDescuento'], '0')) : 0;
        
        const subTotal = parseDecimal(getValue(linea, ['SubTotal'], '0'));
        
        const subTotalWithDiscount = subTotal - discountAmount;
        
        const unitCostWithTax = cantidad > 0 ? montoTotalLinea / cantidad : 0;
        const unitCostWithoutTax = cantidad > 0 ? subTotalWithDiscount / cantidad : 0;

        const impuestoNode = getValue(linea, ['Impuesto']);
        let taxRate = 0.13; // Default
        let taxCode = '08'; // Default
        if (impuestoNode) {
            taxRate = parseDecimal(getValue(impuestoNode, ['Tarifa'], '13')) / 100;
            taxCode = getValue(impuestoNode, ['CodigoTarifaIVA'], '08');
        }
        
        const unitCostWithTaxInColones = moneda === 'USD' ? unitCostWithTax * tipoCambio : unitCostWithTax;
        const unitCostWithoutTaxInColones = moneda === 'USD' ? unitCostWithoutTax * tipoCambio : unitCostWithoutTax;
        
        const numeroLinea = getValue(linea, ['NumeroLinea'], index + 1);

        lines.push({
            id: `${numeroConsecutivo}-${numeroLinea}-${supplierCode}-${index}`,
            invoiceKey: numeroConsecutivo,
            lineNumber: numeroLinea,
            cabysCode: cabysCode,
            supplierCode: supplierCode,
            supplierCodeType: supplierCodeType,
            description: getValue(linea, ['Detalle']),
            quantity: cantidad,
            discountAmount,
            unitCostWithTax: unitCostWithTaxInColones,
            unitCostWithoutTax: unitCostWithoutTaxInColones,
            xmlUnitCost: unitCostWithoutTaxInColones, // Store original cost
            taxRate: taxRate,
            taxCode: taxCode,
            displayMargin: "20",
            margin: 0.20,
            displayTaxRate: (taxRate * 100).toFixed(0),
            displayUnitCost: unitCostWithoutTaxInColones.toFixed(4),
            isCostEdited: false,
            finalSellPrice: 0, // Calculated in the frontend
            profitPerLine: 0, // Calculated in the frontend
            sellPriceWithoutTax: 0, // Calculated in the frontend
            supplierName: emisorNombre,
        });
    }

    return { lines, invoiceInfo };
}

export async function processInvoiceXmls(xmlContents: string[]): Promise<{ lines: CostAssistantLine[], processedInvoices: ProcessedInvoiceInfo[] }> {
    let allLines: CostAssistantLine[] = [];
    const processedInvoices: ProcessedInvoiceInfo[] = [];

    for (const [index, xmlContent] of xmlContents.entries()) {
        try {
            const result = await parseInvoice(xmlContent, index);
            if (result && 'lines' in result) {
                allLines = [...allLines, ...result.lines];
                if (result.invoiceInfo.supplierName) { // Only add if it's a valid invoice
                    processedInvoices.push({
                        ...result.invoiceInfo,
                        status: 'success'
                    });
                }
            } else if (result && 'error' in result) {
                 processedInvoices.push({
                    supplierName: result.details.supplierName || 'Desconocido',
                    invoiceNumber: result.details.invoiceNumber || `Archivo ${index + 1}`,
                    invoiceDate: result.details.invoiceDate || new Date().toISOString(),
                    status: 'error',
                    errorMessage: result.error
                });
            }
        } catch (error: any) {
            console.error("Error parsing one of the XMLs:", error.message);
            processedInvoices.push({
                supplierName: 'Desconocido',
                invoiceNumber: `Archivo ${index + 1}`,
                invoiceDate: new Date().toISOString(),
                status: 'error',
                errorMessage: 'XML malformado o ilegible'
            });
        }
    }
    
    return JSON.parse(JSON.stringify({ lines: allLines, processedInvoices }));
}

const defaultSettings: CostAssistantSettings = {
    draftPrefix: 'AC-',
    nextDraftNumber: 1,
    columnVisibility: {
        cabysCode: true, supplierCode: true, description: true, quantity: true,
        discountAmount: false, unitCostWithoutTax: true, unitCostWithTax: false, taxRate: true,
        margin: true, sellPriceWithoutTax: true, finalSellPrice: true, profitPerLine: true
    },
    discountHandling: 'company',
};

export async function getCostAssistantSettings(userId: number): Promise<CostAssistantSettings> {
    const userPrefs = await getUserPreferences(userId, 'costAssistantSettings');
    const dbSettings = await getDbSettings();
    const settings = { ...defaultSettings, ...dbSettings, ...userPrefs };
    return settings;
}

export async function saveCostAssistantSettings(userId: number, settings: Partial<CostAssistantSettings>): Promise<void> {
    const { draftPrefix, nextDraftNumber, ...userPrefs } = settings;
    await saveUserPreferences(userId, 'costAssistantSettings', userPrefs);
    
    const dbSettingsToSave: Partial<CostAssistantSettings> = {};
    if (draftPrefix !== undefined) dbSettingsToSave.draftPrefix = draftPrefix;
    if (nextDraftNumber !== undefined) dbSettingsToSave.nextDraftNumber = nextDraftNumber;
    
    if (Object.keys(dbSettingsToSave).length > 0) {
        await saveDbSettings(dbSettingsToSave);
    }
    await logInfo('Cost Assistant settings updated', { userId });
}

export async function getAllDrafts(userId: number): Promise<CostAnalysisDraft[]> {
    const drafts = await getAllDraftsServer(userId);
    return JSON.parse(JSON.stringify(drafts));
}

export async function saveDraft(draft: Omit<CostAnalysisDraft, 'id' | 'createdAt' | 'lines'> & { lines: DraftableCostAssistantLine[] }): Promise<void> {
    const settings = await getDbSettings();
    const draftPrefix = settings.draftPrefix || 'AC-';
    const nextDraftNumber = settings.nextDraftNumber || 1;
    await logInfo('Cost analysis draft saved', { name: draft.name, userId: draft.userId });
    await saveDraftServer(draft, draftPrefix, nextDraftNumber);
}

export async function deleteDraft(id: string): Promise<void> {
    await logInfo('Cost analysis draft deleted', { draftId: id });
    return deleteDraftServer(id);
}

export async function getNextDraftNumber(): Promise<number> {
    const settings = await getDbSettings();
    return settings.nextDraftNumber || 1;
}

export async function exportForERP(lines: CostAssistantLine[]): Promise<string> {
    // This function now generates an Excel file that matches the user's ERP template.
    
    const headerRow1 = [
        "CODIGOS (Requerido)", "NOMBRE (Requerido)", "UNIDAD DE MEDIDA (Requerido)", 
        "PRECIO (Sin impuestos) (Requerido)", "MONEDA", "ACTIVIDAD ECONOMICA", 
        "IMPUESTOS (Opcional)", "CÓDIGO CABYS", "ESTADO"
    ];
    const headerRow2 = [
        "04", null, null, null, null, null, "IMP.01"
    ];
    
    // Create the AoA (Array of Arrays) for the worksheet
    const ws_data: (string|number|null)[][] = [headerRow1, headerRow2];
    
    // Map data to the correct structure for the ERP template
    lines.forEach(line => {
        const row: (string | number | null)[] = new Array(headerRow1.length).fill(null);

        row[0] = line.supplierCode; // CODIGOS 04
        row[1] = line.description; // NOMBRE
        row[2] = '78-Unid-Unidad'; // UNIDAD DE MEDIDA
        row[3] = Number(line.sellPriceWithoutTax.toFixed(5)); // PRECIO
        row[4] = 'CRC'; // MONEDA
        row[5] = '4651.0'; // ACTIVIDAD ECONOMICA
        row[6] = line.taxCode; // IMP.01
        row[7] = line.cabysCode; // CÓDIGO CABYS
        row[8] = 'A'; // ESTADO
        
        ws_data.push(row);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(ws_data);
    
    // Define column widths for better readability
    worksheet['!cols'] = [
        { wch: 15 }, // CODIGOS 04
        { wch: 60 }, // NOMBRE
        { wch: 20 }, // UNIDAD DE MEDIDA
        { wch: 20 }, // PRECIO
        { wch: 10 }, // MONEDA
        { wch: 20 }, // ACTIVIDAD ECONOMICA
        { wch: 10 }, // IMP.01
        { wch: 20 }, // CÓDIGO CABYS
        { wch: 10 }, // ESTADO
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Articulos');
    
    const exportDir = path.join(process.cwd(), 'temp_files', 'exports');
    if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
    }
    
    const fileName = `export_erp_${Date.now()}.xlsx`;
    const filePath = path.join(exportDir, fileName);

    try {
        const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
        fs.writeFileSync(filePath, buffer);
    } catch (error: any) {
        logError("Failed to save Excel file to disk", { error: error.message, path: filePath });
        throw new Error(`No se pudo guardar el archivo en la ruta del servidor: ${filePath}`);
    }
    
    return fileName;
}


export async function cleanupExportFile(fileName: string): Promise<void> {
    if (!fileName) {
        throw new Error("Filename is required");
    }
    const exportDir = path.join(process.cwd(), 'temp_files', 'exports');
    const filePath = path.join(exportDir, fileName);

    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
        } catch (error: any) {
            logError("Failed to delete temporary export file", { error: error.message, file: fileName });
            throw new Error("Error del servidor al limpiar el archivo temporal.");
        }
    }
}

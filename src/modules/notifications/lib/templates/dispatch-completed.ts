/**
 * @fileoverview HTML template for the 'onDispatchCompleted' notification event.
 */

import type { DispatchLog } from '@/modules/core/types';
import { format, parseISO } from 'date-fns';

/**
 * Generates an HTML email body for a completed dispatch verification.
 * @param payload The dispatch log data.
 * @returns An HTML string.
 */
export function getDispatchCompletedTemplate(payload: DispatchLog): string {
    const hasDiscrepancy = payload.items.some(item => item.requiredQuantity !== item.verifiedQuantity);

    const tableRows = payload.items.map(item => {
        const difference = item.verifiedQuantity - item.requiredQuantity;
        let statusColor = '#22c55e'; // Green for success
        let diffText = difference === 0 ? 'OK' : (difference > 0 ? `+${difference}` : String(difference));

        if (difference !== 0) {
            statusColor = '#ef4444'; // Red for discrepancy
        }
        
        return `
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 8px;">${item.itemCode}</td>
                <td style="padding: 8px;">${item.barcode || 'N/A'}</td>
                <td style="padding: 8px;">${item.description}</td>
                <td style="padding: 8px; text-align: center;">${item.requiredQuantity}</td>
                <td style="padding: 8px; text-align: center; font-weight: bold;">${item.verifiedQuantity}</td>
                <td style="padding: 8px; text-align: center; font-weight: bold; color: ${statusColor};">${diffText}</td>
            </tr>
        `;
    }).join('');

    const verifiedAt = format(parseISO(payload.verifiedAt), 'dd/MM/yyyy HH:mm:ss');

    return `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 800px; margin: auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
            <div style="background-color: ${hasDiscrepancy ? '#fef2f2' : '#f0f9ff'}; padding: 16px;">
                <h1 style="margin: 0; font-size: 24px; color: ${hasDiscrepancy ? '#b91c1c' : '#0284c7'};">
                    ${hasDiscrepancy ? 'Alerta de Despacho con Discrepancias' : 'Comprobante de Despacho Verificado'}
                </h1>
            </div>
            <div style="padding: 16px;">
                <h2 style="font-size: 18px; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-top: 0;">Resumen del Despacho</h2>
                <p><strong>Documento:</strong> ${payload.documentId} (${payload.documentType})</p>
                <p><strong>Verificado por:</strong> ${payload.verifiedByUserName}</p>
                <p><strong>Fecha y Hora:</strong> ${verifiedAt}</p>
                ${payload.notes ? `<p><strong>Notas Adicionales:</strong> ${payload.notes}</p>` : ''}
                
                <h2 style="font-size: 18px; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-top: 24px;">Detalle de Artículos</h2>
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                    <thead>
                        <tr style="background-color: #f3f4f6; text-align: left;">
                            <th style="padding: 8px;">Código</th>
                            <th style="padding: 8px;">Cod. Barras</th>
                            <th style="padding: 8px;">Descripción</th>
                            <th style="padding: 8px; text-align: center;">Requerido</th>
                            <th style="padding: 8px; text-align: center;">Verificado</th>
                            <th style="padding: 8px; text-align: center;">Diferencia</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
            <div style="background-color: #f8fafc; padding: 12px; text-align: center; font-size: 12px; color: #64748b;">
                Notificación generada automáticamente por Clic-Tools.
            </div>
        </div>
    `;
}

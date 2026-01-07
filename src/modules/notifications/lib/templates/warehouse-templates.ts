/**
 * @fileoverview HTML templates for Warehouse module notification events.
 */

import type { InventoryUnit, WarehouseLocation } from '@/modules/core/types';
import { format } from 'date-fns';
import { getPublicUrl } from '@/modules/core/lib/db';

const getBaseUrl = async () => {
    const companySettings = await getPublicUrl();
    return companySettings?.publicUrl || '';
};

const getWarehouseSearchUrl = async (searchTerm: string) => {
    const baseUrl = await getBaseUrl();
    return `${baseUrl}/dashboard/warehouse/search?q=${encodeURIComponent(searchTerm)}`;
};

const getWarehouseLocationsUrl = async () => {
    const baseUrl = await getBaseUrl();
    return `${baseUrl}/dashboard/warehouse/locations`;
}

const generateBaseWarehouseTemplate = (title: string, content: string, url: string, urlLabel: string) => `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 8px;">
        <div style="background-color: #ecfeff; padding: 16px;">
            <h1 style="margin: 0; font-size: 24px; color: #0891b2;">${title}</h1>
        </div>
        <div style="padding: 16px;">
            ${content}
            <div style="text-align: center; margin-top: 24px;">
                <a href="${url}" style="background-color: #06b6d4; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">${urlLabel}</a>
            </div>
        </div>
        <div style="background-color: #f8fafc; padding: 12px; text-align: center; font-size: 12px; color: #64748b;">
            Notificación generada automáticamente por Clic-Tools.
        </div>
    </div>
`;

export const getReceivingCompletedTemplate = async (unit: InventoryUnit): Promise<string> => {
    const content = `
        <p>Se ha registrado una nueva recepción de mercadería en el almacén.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;">
        <p><strong>Producto ID:</strong> ${unit.productId}</p>
        <p><strong>ID de Unidad (QR):</strong> ${unit.unitCode}</p>
        <p><strong>Cantidad:</strong> ${unit.quantity.toLocaleString('es-CR')}</p>
        <p><strong>Documento de Referencia:</strong> ${unit.documentId || 'N/A'}</p>
        <p><strong>Realizado por:</strong> ${unit.createdBy}</p>
        <p><strong>Fecha y Hora:</strong> ${format(new Date(unit.createdAt), 'dd/MM/yyyy HH:mm')}</p>
    `;
    const url = await getWarehouseSearchUrl(unit.productId);
    return generateBaseWarehouseTemplate('Nueva Recepción de Mercadería', content, url, 'Ver en Almacén');
};

export const getRackCreatedTemplate = async (payload: { rack: WarehouseLocation, parentPath: string, createdBy: string }): Promise<string> => {
    const { rack, parentPath, createdBy } = payload;
    const content = `
        <p>Se ha creado una nueva estructura de rack en el sistema de almacenes.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;">
        <p><strong>Nombre del Rack:</strong> ${rack.name}</p>
        <p><strong>Código del Rack:</strong> ${rack.code}</p>
        <p><strong>Ubicación Padre:</strong> ${parentPath || 'Raíz del almacén'}</p>
        <p><strong>Creado por:</strong> ${createdBy}</p>
        <p><strong>Fecha y Hora:</strong> ${format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
    `;
    const url = await getWarehouseLocationsUrl();
    return generateBaseWarehouseTemplate('Nuevo Rack Creado', content, url, 'Ir a Gestión de Ubicaciones');
};

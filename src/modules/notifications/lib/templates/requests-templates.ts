/**
 * @fileoverview HTML templates for Purchase Request module notification events.
 */

import type { PurchaseRequest } from '@/modules/core/types';
import { format } from 'date-fns';
import { getPublicUrl } from '@/modules/core/lib/db';

const getBaseUrl = async () => {
    const companySettings = await getPublicUrl();
    return companySettings?.publicUrl || '';
};

const getRequestUrl = async (request: PurchaseRequest) => {
    const baseUrl = await getBaseUrl();
    return `${baseUrl}/dashboard/requests?search=${request.consecutive}`;
};

const generateBaseRequestTemplate = (title: string, request: PurchaseRequest, content: string, url: string) => `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 8px;">
        <div style="background-color: #fffbeb; padding: 16px;">
            <h1 style="margin: 0; font-size: 24px; color: #b45309;">${title}</h1>
        </div>
        <div style="padding: 16px;">
            <p><strong>Solicitud de Compra:</strong> ${request.consecutive}</p>
            <p><strong>Artículo:</strong> ${request.itemDescription} (${request.itemId})</p>
            <p><strong>Cantidad:</strong> ${request.quantity.toLocaleString('es-CR')}</p>
            <p><strong>Cliente Asociado:</strong> ${request.clientName || 'N/A'}</p>
            <p><strong>Realizado por:</strong> ${request.lastStatusUpdateBy || request.requestedBy}</p>
            <p><strong>Fecha del Evento:</strong> ${format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;">
            ${content}
            <div style="text-align: center; margin-top: 24px;">
                <a href="${url}" style="background-color: #d97706; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Ver Solicitud</a>
            </div>
        </div>
        <div style="background-color: #f8fafc; padding: 12px; text-align: center; font-size: 12px; color: #64748b;">
            Notificación generada automáticamente por Clic-Tools.
        </div>
    </div>
`;

export const getRequestCreatedTemplate = async (request: PurchaseRequest): Promise<string> => {
    const content = `<p>Se ha creado una nueva solicitud de compra y está pendiente de revisión.</p>`;
    const url = await getRequestUrl(request);
    return generateBaseRequestTemplate('Nueva Solicitud de Compra', request, content, url);
};

export const getRequestApprovedTemplate = async (request: PurchaseRequest): Promise<string> => {
    const content = `<p>La solicitud de compra ha sido <strong>APROBADA</strong> y está lista para ser ordenada.</p>`;
    const url = await getRequestUrl(request);
    return generateBaseRequestTemplate('Solicitud de Compra Aprobada', request, content, url);
};

export const getRequestOrderedTemplate = async (request: PurchaseRequest): Promise<string> => {
    const content = `
        <p>La solicitud de compra ha sido marcada como <strong>ORDENADA</strong>.</p>
        <ul>
            <li><strong>Proveedor:</strong> ${request.manualSupplier || 'No especificado'}</li>
            <li><strong>Fecha Estimada de Llegada:</strong> ${request.arrivalDate ? format(new Date(request.arrivalDate), 'dd/MM/yyyy') : 'No especificada'}</li>
        </ul>
    `;
    const url = await getRequestUrl(request);
    return generateBaseRequestTemplate('Solicitud de Compra Ordenada', request, content, url);
};

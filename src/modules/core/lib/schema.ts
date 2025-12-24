/**
 * @fileoverview Defines the expected database schema for the main intratool.db.
 * This is used by the central database audit system to verify integrity.
 */

import type { ExpectedSchema } from '@/modules/core/types';

export const mainDbSchema: ExpectedSchema = {
    'users': ['id', 'name', 'email', 'password', 'phone', 'whatsapp', 'erpAlias', 'avatar', 'role', 'recentActivity', 'securityQuestion', 'securityAnswer', 'forcePasswordChange', 'activeWizardSession'],
    'roles': ['id', 'name', 'permissions'],
    'company_settings': ['id', 'name', 'taxId', 'address', 'phone', 'email', 'logoUrl', 'systemName', 'quotePrefix', 'nextQuoteNumber', 'decimalPlaces', 'quoterShowTaxId', 'searchDebounceTime', 'syncWarningHours', 'lastSyncTimestamp', 'importMode', 'customerFilePath', 'productFilePath', 'exemptionFilePath', 'stockFilePath', 'locationFilePath', 'cabysFilePath', 'supplierFilePath', 'erpPurchaseOrderHeaderFilePath', 'erpPurchaseOrderLineFilePath'],
    'logs': ['id', 'timestamp', 'type', 'message', 'details'],
    'api_settings': ['id', 'exchangeRateApi', 'haciendaExemptionApi', 'haciendaTributariaApi'],
    'customers': ['id', 'name', 'address', 'phone', 'taxId', 'currency', 'creditLimit', 'paymentCondition', 'salesperson', 'active', 'email', 'electronicDocEmail'],
    'products': ['id', 'description', 'classification', 'lastEntry', 'active', 'notes', 'unit', 'isBasicGood', 'cabys'],
    'exemptions': ['code', 'description', 'customer', 'authNumber', 'startDate', 'endDate', 'percentage', 'docType', 'institutionName', 'institutionCode'],
    'quote_drafts': ['id', 'createdAt', 'userId', 'customerId', 'customerDetails', 'lines', 'totals', 'notes', 'currency', 'exchangeRate', 'purchaseOrderNumber', 'deliveryAddress', 'deliveryDate', 'sellerName', 'sellerType', 'quoteDate', 'validUntilDate', 'paymentTerms', 'creditDays'],
    'exemption_laws': ['docType', 'institutionName', 'authNumber'],
    'cabys_catalog': ['code', 'description', 'taxRate'],
    'stock': ['itemId', 'stockByWarehouse', 'totalStock'],
    'sql_config': ['key', 'value'],
    'import_queries': ['type', 'query'],
    'suggestions': ['id', 'content', 'userId', 'userName', 'isRead', 'timestamp'],
    'user_preferences': ['userId', 'key', 'value'],
    'notifications': ['id', 'userId', 'message', 'href', 'isRead', 'timestamp', 'entityId', 'entityType', 'taskType'],
    'email_settings': ['key', 'value'],
    'suppliers': ['id', 'name', 'alias', 'email', 'phone'],
    'erp_order_headers': ['PEDIDO', 'ESTADO', 'CLIENTE', 'FECHA_PEDIDO', 'FECHA_PROMETIDA', 'ORDEN_COMPRA', 'TOTAL_UNIDADES', 'MONEDA_PEDIDO', 'USUARIO'],
    'erp_order_lines': ['PEDIDO', 'PEDIDO_LINEA', 'ARTICULO', 'CANTIDAD_PEDIDA', 'PRECIO_UNITARIO'],
    'erp_purchase_order_headers': ['ORDEN_COMPRA', 'PROVEEDOR', 'FECHA_HORA', 'ESTADO', 'CreatedBy'],
    'erp_purchase_order_lines': ['ORDEN_COMPRA', 'ARTICULO', 'CANTIDAD_ORDENADA'],
};

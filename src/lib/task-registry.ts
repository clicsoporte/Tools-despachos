/**
 * @fileoverview This file acts as a central registry for all available "actions"
 * that can be triggered by the scheduled task system (cron jobs).
 * To add a new automated task, you must define the function that performs the action
 * and then register it here.
 */

import { syncAllData } from '@/modules/core/lib/actions';
// Example for future: import { sendDailyProductionSummaryToTelegram } from '@/modules/analytics/lib/actions';

interface TaskDefinition {
    name: string;
    description: string;
    action: () => Promise<any>;
}

/**
 * A dictionary of all predefined tasks that can be scheduled.
 * The key is a unique identifier that will be stored in the database.
 */
export const AVAILABLE_TASKS: Record<string, TaskDefinition> = {
    'sync-erp': {
        name: 'Sincronizar Datos Completos del ERP',
        description: 'Ejecuta la importación de clientes, productos, existencias, etc., desde la fuente de datos configurada (archivos o SQL).',
        action: syncAllData,
    },
    // Example of a future task:
    // 'send-daily-report-telegram': {
    //     name: 'Enviar Resumen de Producción a Telegram',
    //     description: 'Compila un resumen de las órdenes completadas del día y lo envía al canal de Telegram configurado.',
    //     action: async () => { /* logic to generate and send report */ },
    // },
};

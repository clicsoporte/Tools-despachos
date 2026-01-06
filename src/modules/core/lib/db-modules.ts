/**
 * @fileoverview This file acts as the central registry for all database modules.
 * It defines the static configuration for each module, including its database file
 * and schema, but does NOT contain executable functions, to prevent circular dependencies.
 */

import type { DatabaseModule } from '@/modules/core/types';

// Import schema definitions
import { plannerSchema } from '../../planner/lib/schema';
import { requestSchema } from '../../requests/lib/schema';
import { warehouseSchema } from '../../warehouse/lib/schema';
import { costAssistantSchema } from '../../cost-assistant/lib/schema';
import { notificationsSchema } from '../../notifications/lib/schema';
import { mainDbSchema } from './schema';

/**
 * Acts as a registry for all database modules in the application.
 * This is the single source of truth for module definitions, containing only configuration data.
 */
export const DB_MODULES: Omit<DatabaseModule, 'initFn' | 'migrationFn'>[] = [
    { 
        id: 'clic-tools-main', 
        name: 'Clic-Tools (Sistema Principal)', 
        dbFile: 'intratool.db', 
        schema: mainDbSchema,
    },
    { 
        id: 'purchase-requests', 
        name: 'Solicitud de Compra', 
        dbFile: 'requests.db', 
        schema: requestSchema,
    },
    { 
        id: 'production-planner', 
        name: 'Planificador de Producción', 
        dbFile: 'planner.db', 
        schema: plannerSchema,
    },
    { 
        id: 'warehouse-management', 
        name: 'Gestión de Almacenes', 
        dbFile: 'warehouse.db', 
        schema: warehouseSchema,
    },
    { 
        id: 'cost-assistant', 
        name: 'Asistente de Costos', 
        dbFile: 'cost_assistant.db', 
        schema: costAssistantSchema,
    },
    {
        id: 'notifications-engine',
        name: 'Motor de Notificaciones',
        dbFile: 'notifications.db',
        schema: notificationsSchema,
    },
];

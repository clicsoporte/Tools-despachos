/**
 * @fileoverview This file acts as the central registry for all database modules.
 * It defines the static configuration for each module, including its database file,
 * initialization function, and migration function. This structure allows the core
 * `connectDb` function to be completely agnostic of any specific module, promoting
 * true modularity and decoupling. This file should only contain configuration and
 * import function signatures, not implementations, to avoid circular dependencies.
 */

import type { DatabaseModule } from '@/modules/core/types';

// Import function signatures from their respective modules
import { initializePlannerDb, runPlannerMigrations } from '../../planner/lib/db';
import { initializeRequestsDb, runRequestMigrations } from '../../requests/lib/db';
import { initializeWarehouseDb, runWarehouseMigrations } from '../../warehouse/lib/db';
import { initializeCostAssistantDb, runCostAssistantMigrations } from '../../cost-assistant/lib/db';
import { initializeMainDatabase, runMainDbMigrations } from "./db";

// Import schema definitions
import { plannerSchema } from '../../planner/lib/schema';
import { requestSchema } from '../../requests/lib/schema';
import { warehouseSchema } from '../../warehouse/lib/schema';
import { costAssistantSchema } from '../../cost-assistant/lib/schema';

/**
 * Acts as a registry for all database modules in the application.
 * This has been moved to `data.ts` to prevent circular dependencies.
 * This file is now deprecated and can be removed in a future cleanup.
 */
export const DEPRECATED_DB_MODULES: DatabaseModule[] = [];

    
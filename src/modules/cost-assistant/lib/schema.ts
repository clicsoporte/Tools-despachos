
/**
 * @fileoverview Defines the expected database schema for the Cost Assistant module.
 * This is used by the central database audit system to verify integrity.
 */

import type { ExpectedSchema } from '@/modules/core/types';

export const costAssistantSchema: ExpectedSchema = {
    'drafts': ['id', 'userId', 'name', 'createdAt', 'data'],
    'settings': ['key', 'value'],
};

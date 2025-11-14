/**
 * @fileoverview This hook has been refactored to be a simple facade.
 * It now imports and re-exports the centralized logic from `usePurchaseSuggestionsLogic`
 * to ensure a single source of truth across the application.
 */
'use client';

import { usePurchaseSuggestionsLogic } from '@/modules/analytics/hooks/usePurchaseSuggestionsLogic';

export { type SortKey } from '@/modules/analytics/hooks/usePurchaseSuggestionsLogic';

export const useRequestSuggestions = () => {
    // This hook now delegates all its functionality to the centralized logic hook.
    // This ensures a single source of truth and eliminates code duplication.
    return usePurchaseSuggestionsLogic();
};

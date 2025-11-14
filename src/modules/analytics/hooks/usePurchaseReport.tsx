/**
 * @fileoverview Hook to manage the logic for the purchase report page.
 * This hook now delegates its logic to the centralized `usePurchaseSuggestionsLogic`
 * to avoid code duplication while providing a read-only view of the data.
 */
'use client';

import { usePurchaseSuggestionsLogic } from './usePurchaseSuggestionsLogic';
export type { SortKey } from './usePurchaseSuggestionsLogic';

export function usePurchaseReport() {
    // We reuse the core logic hook.
    const suggestionsLogic = usePurchaseSuggestionsLogic();

    // Here, we could override or omit certain actions if this report needed
    // to have a strictly read-only behavior, but for now, we pass everything through.
    // For example, if we wanted to disable saving preferences from this view:
    // const { savePreferences, ...safeActions } = suggestionsLogic.actions;
    // return { ...suggestionsLogic, actions: safeActions };

    return suggestionsLogic;
}

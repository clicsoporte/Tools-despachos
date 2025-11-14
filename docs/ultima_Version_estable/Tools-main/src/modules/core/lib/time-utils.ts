/**
 * @fileoverview This file contains centralized utility functions related to time and date calculations.
 * Centralizing this logic adheres to the DRY (Don't Repeat Yourself) principle and makes
 * the business rules for date calculations consistent and easy to update.
 */

import { differenceInCalendarDays, parseISO } from 'date-fns';

/**
 * Calculates the number of days remaining until a given date and returns a label and a color class.
 * This function is used across different modules (Planner, Requests) to provide a consistent
 * visual indicator of urgency.
 *
 * @param {string | null | undefined} dateStr - The target date in ISO string format. Can be null or undefined.
 * @returns {{ label: string; color: string; }} An object containing the display label and a Tailwind CSS color class.
 */
export function getDaysRemaining(dateStr: string | null | undefined) {
    if (!dateStr) {
        return { label: 'Sin fecha', color: 'text-gray-500' };
    }

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const targetDate = parseISO(dateStr);
        targetDate.setHours(0, 0, 0, 0);

        const days = differenceInCalendarDays(targetDate, today);

        let colorClass = 'text-green-600';
        if (days <= 2) colorClass = 'text-orange-500';
        if (days < 1) colorClass = 'text-red-600';

        let label = '';
        if (days === 0) {
            label = 'Para Hoy';
        } else if (days < 0) {
            label = `Atrasado ${Math.abs(days)}d`;
        } else {
            label = `Faltan ${days}d`;
        }

        return { label, color: colorClass };
        
    } catch (error) {
        console.error("Error parsing date in getDaysRemaining:", error);
        return { label: 'Fecha inv.', color: 'text-red-600' };
    }
}

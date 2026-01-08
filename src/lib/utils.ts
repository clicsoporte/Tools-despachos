import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generates initials from a name string.
 * @param name The full name.
 * @returns A string with the first letter of each word, up to 2 characters, in uppercase.
 */
export function getInitials(name: string): string {
    if (!name) return "";
    const parts = name.split(" ");
    if (parts.length === 1) {
        return parts[0].substring(0, 2).toUpperCase();
    }
    return (parts[0][0] + (parts[parts.length - 1][0] || '')).toUpperCase();
}

/**
 * Reformats an employee name from "LAST1 LAST2 NAME1 NAME2" to "NAME1 NAME2 LAST1 LAST2".
 * Handles names with single or compound first names.
 * @param name - The original name string from the database, e.g., "Vargas Mendez Juan Agustin".
 * @returns The reformatted name, or the original name if formatting fails.
 */
export function reformatEmployeeName(name: string | null | undefined): string {
  if (!name) return "";

  const parts = name.trim().split(/\s+/);

  // If there are fewer than 3 parts, we can't reliably reorder, so return as is.
  // This also handles names that might already be in the correct format.
  if (parts.length < 3) {
    return name;
  }

  // Assumes the first two words are always the last names.
  const lastNames = parts.slice(0, 2);
  const firstNames = parts.slice(2);
  
  return [...firstNames, ...lastNames].join(' ');
}

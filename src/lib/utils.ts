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
 * Reformats an employee name from "APELLIDO1 APELLIDO2 NOMBRE1 [NOMBRE2]" to "NOMBRE1 [NOMBRE2] APELLIDO1 APELLIDO2".
 * This version is more robust and handles names with one or more first names.
 * @param name - The original name string from the database, e.g., "Vargas Mendez Juan Agustin".
 * @returns The reformatted name, or the original name if formatting is not possible.
 */
export function reformatEmployeeName(name: string | null | undefined): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);

  // If there are 2 or fewer parts, it's likely a simple name or already formatted.
  if (parts.length <= 2) {
    return name;
  }

  // The logic is to take the first two words as last names and move them to the end.
  const lastNames = parts.slice(0, 2);
  const firstNames = parts.slice(2);
  
  return [...firstNames, ...lastNames].join(' ');
}

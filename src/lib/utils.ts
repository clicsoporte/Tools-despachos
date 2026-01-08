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
 * Reformats an employee name from "LAST1 LAST2, NAME" to "NAME, LAST1 LAST2".
 * @param name - The original name string from the database.
 * @returns The reformatted name, or the original name if formatting fails.
 */
export function reformatEmployeeName(name: string | null | undefined): string {
  if (!name) return "";
  
  const parts = name.split(',');
  if (parts.length === 2) {
    const lastNamePart = parts[0].trim();
    const firstNamePart = parts[1].trim();
    // Changed to use a comma for better readability.
    return `${firstNamePart}, ${lastNamePart}`;
  }
  
  // Return the original name if it doesn't match the expected format
  return name;
}

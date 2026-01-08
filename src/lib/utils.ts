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
 * Reformats an employee name from "LAST1 LAST2, NAME" to "NAME LAST1 LAST2".
 * @param name - The original name string from the database.
 * @returns The reformatted name, or the original name if formatting fails.
 */
export function reformatEmployeeName(name: string | null | undefined): string {
  if (!name) return "";

  // Handle "APELLIDO1 APELLIDO2 NOMBRE" format (without comma)
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1) {
    const firstName = parts.pop(); // The last part is the name
    const lastNames = parts.join(' '); // The rest are last names
    return `${firstName} ${lastNames}`;
  }

  // Fallback for names with commas, just in case
  const commaParts = name.split(',');
  if (commaParts.length === 2) {
    const lastNamePart = commaParts[0].trim();
    const firstNamePart = commaParts[1].trim();
    return `${firstNamePart} ${lastNamePart}`;
  }
  
  return name; // Return original if it doesn't match expected formats
}

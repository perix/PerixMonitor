import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Helper for consistent Swiss currency formatting (e.g. 8'015.00)
// Uses apostrophe for thousands and dot for decimals
// Helper for consistent Swiss currency formatting (e.g. 8'015.00)
// Uses apostrophe for thousands and dot for decimals (standard it-CH)
export function formatSwissMoney(value: number | undefined | null, decimals: number = 2): string {
  if (value === undefined || value === null) return "0";
  return new Intl.NumberFormat('it-CH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true
  }).format(value);
}

// Helper for consistent Swiss number formatting (e.g. 1'000)
export function formatSwissNumber(value: number | undefined | null, decimals: number = 0): string {
  if (value === undefined || value === null) return "0";
  return new Intl.NumberFormat('it-CH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true
  }).format(value);
}

/**
 * Parse an ISO date string (YYYY-MM-DD) as a LOCAL date.
 * 
 * IMPORTANT: JavaScript's `new Date('2024-03-04')` parses the string as UTC midnight,
 * which can cause the date to appear shifted when displayed in local time.
 * This function parses the date components directly to create a local date.
 * 
 * @param dateStr - ISO date string in format YYYY-MM-DD or with time component
 * @returns Date object representing the date in local timezone, or null if invalid
 */
export function parseISODateLocal(dateStr: string | number | Date | undefined | null): Date | null {
  if (!dateStr) return null;

  // If it's already a Date, return it
  if (dateStr instanceof Date) return dateStr;

  // If it's a number (timestamp), convert directly
  if (typeof dateStr === 'number') return new Date(dateStr);

  // Parse ISO string YYYY-MM-DD
  const str = String(dateStr);

  // Extract just the date part (in case it has time component)
  const datePart = str.split('T')[0];
  const parts = datePart.split('-');

  if (parts.length !== 3) return null;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

  // Create date in LOCAL timezone (not UTC)
  return new Date(year, month, day);
}

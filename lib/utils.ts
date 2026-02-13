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

/**
 * Ensures a color has sufficient lightness to be visible on a dark background.
 * If the color is too dark, it returns a lighter version of the same hue.
 * 
 * @param hexColor - Hex color string (e.g. "#FF0000" or "#F00")
 * @param minLightness - Minimum lightness value (0-100), default 60 for dark mode visibility
 */
export function getAccessibleColor(hexColor: string, minLightness: number = 60): string {
  // Remove # if present
  let color = hexColor.replace(/^#/, '');

  // Parse hex
  if (color.length === 3) {
    color = color[0] + color[0] + color[1] + color[1] + color[2] + color[2];
  }

  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);

  // Convert RGB to HSL
  // r, g, b divide by 255
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rNorm: h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0); break;
      case gNorm: h = (bNorm - rNorm) / d + 2; break;
      case bNorm: h = (rNorm - gNorm) / d + 4; break;
    }
    h /= 6;
  }

  // Convert lightness to 0-100 range for easier comparison
  const currentLightness = l * 100;

  // If already light enough, return original
  if (currentLightness >= minLightness) {
    return hexColor; // Return original to preserve exact shade if possible
  }

  // Otherwise, boost lightness to minimum
  l = minLightness / 100;

  // Convert back to RGB
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  const newR = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const newG = Math.round(hue2rgb(p, q, h) * 255);
  const newB = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);

  const toHex = (n: number) => {
    const hex = n.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
}

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Helper for consistent Swiss currency formatting (e.g. 8'015.00)
// Uses apostrophe for thousands and dot for decimals
export function formatSwissMoney(value: number | undefined | null, decimals: number = 2): string {
  if (value === undefined || value === null) return "0";
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).replace(/,/g, "'");
}

// Helper for consistent Swiss number formatting (e.g. 1'000)
export function formatSwissNumber(value: number | undefined | null, decimals: number = 0): string {
  if (value === undefined || value === null) return "0";
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).replace(/,/g, "'");
}

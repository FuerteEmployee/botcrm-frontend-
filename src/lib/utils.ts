import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * YYYY-MM-DD key for the IST calendar day containing `date`. Attendance
 * records are keyed to IST midnight server-side (see istStartOfDay in the
 * backend's attendance_helpers.js) regardless of what timezone the server
 * process runs in — comparing with a naive `date.toISOString().slice(0,10)`
 * or `new Date(date).getDate()` reads the *browser's* timezone instead and
 * silently disagrees with the server for most of the day. Always key
 * attendance days with this helper, on both ends, so "today" means the same
 * thing everywhere.
 */
export function toISTDateKey(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function formatTime12h(time24: string) {
  if (!time24) return "";
  const [hours, minutes] = time24.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;
}

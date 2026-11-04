import { en, type MessageKey } from "./en";

export type { MessageKey };

// All UI text lives in en.ts; {name} placeholders are filled from vars.
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const template: string = en[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

// "1 Nov 2026" and "1 Nov 2026, 18:20" in the user's time zone.
export const formatDate = (iso: string) => dateFormat.format(new Date(iso));
export const formatDateTime = (iso: string) => `${formatDate(iso)}, ${timeFormat.format(new Date(iso))}`;

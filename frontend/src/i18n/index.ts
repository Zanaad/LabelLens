import { en, type MessageKey } from "./en";

export type { MessageKey };

// All UI text lives in en.ts; {name} placeholders are filled from vars.
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const template: string = en[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

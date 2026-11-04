import type { Role } from "../api/auth";
import type { MessageKey } from "../i18n";

// `active` overrides the default prefix match: review and result belong to the Scan flow.
type NavItem = { to: string; label: MessageKey; roles: Role[]; active?: RegExp };

// Pharmacist nav follows the design; expert and admin navs are our own (not in the design).
const NAV_ITEMS: NavItem[] = [
  { to: "/scan", label: "nav.scan", roles: ["pharmacist"], active: /^\/scan$|^\/scans\/[^/]+\/(review|result|summary)$/ },
  { to: "/scans", label: "nav.myScans", roles: ["pharmacist"], active: /^\/scans(\/[^/]+)?$/ },
  { to: "/review", label: "nav.reviewQueue", roles: ["expert", "admin"] },
  { to: "/admin", label: "nav.admin", roles: ["admin"] },
  { to: "/reference", label: "nav.reference", roles: ["pharmacist", "expert", "admin"] },
  { to: "/validation", label: "nav.validation", roles: ["pharmacist", "expert", "admin"] },
  { to: "/methods", label: "nav.methods", roles: ["pharmacist", "expert", "admin"] },
];

export const ROLE_HOME: Record<Role, string> = {
  pharmacist: "/scan",
  expert: "/review",
  admin: "/admin",
};

export function navFor(role: Role): NavItem[] {
  return NAV_ITEMS.filter((i) => i.roles.includes(role));
}

// Icons copied from the design prototype (24px grid, 1.75 stroke). Decorative: aria-hidden.
import type { ReactNode, SVGProps } from "react";

type P = { size?: number } & Omit<SVGProps<SVGSVGElement>, "children">;

function Stroke({ size = 20, children, ...rest }: P & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="flex-none"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className="flex-none text-accent">
      <rect x="4" y="3" width="19" height="25" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M8.5 20c0-6.2 3.6-10 9.5-10 0 5.8-3.7 10-9.5 10z" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M8.5 20l5.6-5.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="24" cy="24" r="6.2" stroke="currentColor" strokeWidth="2" className="fill-surface" />
      <circle cx="24" cy="24" r="2.8" stroke="currentColor" strokeWidth="1.5" strokeDasharray="1.6 1.4" />
    </svg>
  );
}

export const SunIcon = (p: P) => (
  <Stroke {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Stroke>
);
export const MoonIcon = (p: P) => (
  <Stroke {...p}>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
  </Stroke>
);
export const EyeIcon = (p: P) => (
  <Stroke {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </Stroke>
);
export const LockIcon = (p: P) => (
  <Stroke size={16} {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Stroke>
);
export const InfoIcon = (p: P) => (
  <Stroke size={16} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.6h.01" />
  </Stroke>
);
export const ClockIcon = (p: P) => (
  <Stroke size={18} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Stroke>
);
export const MenuIcon = (p: P) => (
  <Stroke {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Stroke>
);
export const SettingsIcon = (p: P) => (
  <Stroke size={18} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
  </Stroke>
);
export const SignOutIcon = (p: P) => (
  <Stroke size={18} {...p}>
    <path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5" />
    <path d="M10 16l-4-4 4-4M6 12h10" />
  </Stroke>
);
/** Pharmacist role (capsule), from the design. */
export const CapsuleIcon = (p: P) => (
  <Stroke size={14} {...p}>
    <path d="M10.5 3.5a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7-7z" />
    <path d="M7 7l7 7" />
  </Stroke>
);
/** Expert reviewer role (our own; not in the design). */
export const ReviewIcon = (p: P) => (
  <Stroke size={14} {...p}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4h6v3H9zM9 13l2 2 4-4" />
  </Stroke>
);
/** Admin role (our own; not in the design). */
export const KeyIcon = (p: P) => (
  <Stroke size={14} {...p}>
    <circle cx="8" cy="15" r="4" />
    <path d="M11 12l8-8M16 7l2 2M14 9l2 2" />
  </Stroke>
);
export const AlertIcon = (p: P) => (
  <Stroke size={18} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.4h.01" />
  </Stroke>
);

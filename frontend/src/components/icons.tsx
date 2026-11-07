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
// Standard gear (Lucide "settings", ISC licence); the design's version looked like a sun.
export const SettingsIcon = (p: P) => (
  <Stroke size={18} {...p}>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
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

// Verdict icons: always shown next to the verdict text, never colour alone.
export const MatchIcon = (p: P) => (
  <Stroke size={22} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.5l2.6 2.6L16 9.6" />
  </Stroke>
);
export const PartialIcon = (p: P) => (
  <Stroke size={22} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
  </Stroke>
);
export const CannotSayIcon = (p: P) => (
  <Stroke size={22} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.6" />
    <path d="M12 16.8h.01" />
  </Stroke>
);
export const NotStatedIcon = (p: P) => (
  <Stroke size={18} {...p}>
    <circle cx="12" cy="12" r="9" strokeDasharray="2.6 2.6" />
    <path d="M8.5 12h7" />
  </Stroke>
);

export const MismatchIcon = (p: P) => (
  <Stroke size={18} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 10.2h8M8 13.8h8M14.2 7.4l-4.4 9.2" />
  </Stroke>
);
export const NotApplicableIcon = (p: P) => (
  <Stroke size={18} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M6 18L18 6" />
  </Stroke>
);
export const CopyIcon = (p: P) => (
  <Stroke {...p}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
  </Stroke>
);
export const RestartIcon = (p: P) => (
  <Stroke {...p}>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
    <path d="M4.5 4.5v4h4" />
  </Stroke>
);
export const BookIcon = (p: P) => (
  <Stroke {...p}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
    <path d="M4 20.5V5.5" />
  </Stroke>
);
export const ExternalIcon = (p: P) => (
  <Stroke size={16} {...p}>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Stroke>
);
export const CloseIcon = (p: P) => (
  <Stroke {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Stroke>
);

export const ShareIcon = (p: P) => (
  <Stroke {...p}>
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="6" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" />
  </Stroke>
);
export const CompareIcon = (p: P) => (
  <Stroke {...p}>
    <rect x="3" y="5" width="7.5" height="14" rx="1.5" />
    <rect x="13.5" y="5" width="7.5" height="14" rx="1.5" />
  </Stroke>
);
export const DownloadIcon = (p: P) => (
  <Stroke {...p}>
    <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14" />
  </Stroke>
);
export const LinkIcon = (p: P) => (
  <Stroke {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Stroke>
);
export const SearchIcon = (p: P) => (
  <Stroke size={18} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </Stroke>
);
export const SortIcon = (p: P) => (
  <Stroke size={14} {...p}>
    <path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4" />
  </Stroke>
);
export const InboxIcon = (p: P) => (
  <Stroke size={28} {...p}>
    <path d="M3 13l3-8h12l3 8v6H3z" />
    <path d="M3 13h5l1 2h6l1-2h5" />
  </Stroke>
);
export const DocumentIcon = (p: P) => (
  <Stroke {...p}>
    <path d="M7 3h7l5 5v13H7z" />
    <path d="M14 3v5h5M10 13h6M10 17h6" />
  </Stroke>
);
export const HistoryIcon = (p: P) => (
  <Stroke size={16} {...p}>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4v4h4M12 8v4l3 2" />
  </Stroke>
);
export const PrinterIcon = (p: P) => (
  <Stroke {...p}>
    <path d="M7 9V3h10v6" />
    <rect x="3" y="9" width="18" height="8" rx="2" />
    <path d="M7 14h10v7H7z" />
  </Stroke>
);

export const UploadIcon = (p: P) => (
  <Stroke {...p}>
    <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5" />
    <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
  </Stroke>
);
export const CameraIcon = (p: P) => (
  <Stroke {...p}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </Stroke>
);
export const TextIcon = (p: P) => (
  <Stroke {...p}>
    <path d="M5 6h14M5 10h14M5 14h10M5 18h6" />
  </Stroke>
);
export const WarningIcon = (p: P) => (
  <Stroke size={24} {...p}>
    <path d="M12 3.5l9 16H3z" />
    <path d="M12 10v4.2M12 17h.01" />
  </Stroke>
);
export const ArrowRightIcon = (p: P) => (
  <Stroke size={18} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Stroke>
);
export const ArrowLeftIcon = (p: P) => (
  <Stroke size={18} {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Stroke>
);
export const EditIcon = (p: P) => (
  <Stroke size={14} {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  </Stroke>
);

/** Confidence bars: filled = how many of three bars are solid. */
export function ConfidenceIcon({ filled }: { filled: 1 | 2 | 3 }) {
  const bars = [
    { x: 0, y: 7, h: 5 },
    { x: 5.5, y: 4, h: 8 },
    { x: 11, y: 0, h: 12 },
  ];
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true" className="flex-none">
      {bars.map((b, i) => (
        <rect
          key={b.x}
          x={b.x}
          y={b.y}
          width="3"
          height={b.h}
          rx="1"
          fill={i < filled ? "currentColor" : "none"}
          stroke={i < filled ? "none" : "currentColor"}
        />
      ))}
    </svg>
  );
}

import { useState } from "react";
import { t } from "../i18n";
import { InfoIcon, MoonIcon, SunIcon } from "./icons";

// main.tsx applies the stored theme before first paint.
export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === "dark");
  const toggle = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("ll_theme", next);
    setDark(!dark);
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? t("theme.toLight") : t("theme.toDark")}
      className="inline-flex h-11 w-11 items-center justify-center rounded-control border border-border-2 bg-surface text-text hover:bg-surface-2"
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

export function DisclaimerPill() {
  return (
    <span
      title={t("app.disclaimer")}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-cannot-bd bg-cannot-bg px-3 py-1.5 text-eyebrow font-semibold text-cannot-fg"
    >
      <InfoIcon />
      {t("app.disclaimer")}
    </span>
  );
}

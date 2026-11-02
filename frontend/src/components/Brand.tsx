import { Link } from "react-router-dom";
import { t } from "../i18n";
import { LogoMark } from "./icons";

export function Brand({ to }: { to?: string }) {
  const inner = (
    <>
      <LogoMark />
      <span className="text-brand font-bold tracking-[-0.01em]">{t("app.name")}</span>
    </>
  );
  const cls = "inline-flex min-h-control items-center gap-2.5 text-text no-underline hover:text-text";
  return to ? (
    <Link to={to} aria-label={t("app.home")} className={cls}>
      {inner}
    </Link>
  ) : (
    <span className={cls}>{inner}</span>
  );
}

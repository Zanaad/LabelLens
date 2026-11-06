import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { t } from "../i18n";
import { LockIcon } from "./icons";

function Col({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5">
      <p className="m-0 flex items-center gap-1.5 text-sm font-semibold text-text">{title}</p>
      <p className="m-0 text-sm text-muted">{children}</p>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="no-print border-t border-border bg-surface">
      <div className="mx-auto flex max-w-shell flex-wrap gap-x-10 gap-y-6 px-6 pt-7 pb-8">
        <Col title={t("footer.sourcesTitle")}>
          {t("footer.sourcesBody")} <Link to="/about">{t("footer.about")}</Link>
        </Col>
        <Col title={t("footer.licencesTitle")}>{t("footer.licencesBody")}</Col>
        <Col
          title={
            <>
              <LockIcon />
              {t("footer.privacyTitle")}
            </>
          }
        >
          {t("app.privacyNote")}
        </Col>
        <Col title={t("footer.disclaimerTitle")}>{t("footer.disclaimerBody")}</Col>
      </div>
    </footer>
  );
}

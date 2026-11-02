import type { ReactNode } from "react";
import { t } from "../i18n";
import { Brand } from "./Brand";
import { Footer } from "./Footer";
import { ThemeToggle } from "./HeaderControls";
import { LockIcon } from "./icons";
import { Eyebrow } from "./ui";

/** Sign-in / register layout: form card on the left, explainer aside on the right. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print border-b border-border bg-surface">
        <div className="mx-auto flex max-w-shell flex-wrap items-center justify-between gap-x-5 gap-y-2 px-6 py-2.5">
          <Brand />
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-auth flex-[1_0_auto] flex-wrap items-start justify-center gap-x-16 gap-y-10 px-6 pt-12 pb-16">
        <section className="flex min-w-0 max-w-card flex-[1_1_400px] flex-col gap-[18px] rounded-control border border-border bg-surface p-8">
          {children}
        </section>
        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-[18px] py-2">
          <Eyebrow>{t("authAside.eyebrow")}</Eyebrow>
          <h2 className="m-0 max-w-[22ch] text-h1 leading-[1.25] font-semibold">{t("authAside.heading")}</h2>
          <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
            {(["authAside.step1", "authAside.step2", "authAside.step3"] as const).map((k, i) => (
              <li key={k} className="flex gap-3">
                <span className="inline-flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-accent-weak font-bold text-accent">
                  {i + 1}
                </span>
                <span>{t(k)}</span>
              </li>
            ))}
          </ol>
          <p className="m-0 flex items-start gap-2 text-body-sm text-muted">
            <LockIcon />
            {t("app.privacyNote")}
          </p>
        </aside>
      </main>
      <Footer />
    </div>
  );
}

export function AuthHeading({ title, intro }: { title: string; intro: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="m-0 text-h1 font-semibold">{title}</h1>
      <p className="m-0 text-sm text-muted">{intro}</p>
    </div>
  );
}

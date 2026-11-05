import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useLogout, type Role, type User } from "../api/auth";
import { navFor, ROLE_HOME } from "../app/navigation";
import { t } from "../i18n";
import { Brand } from "./Brand";
import { Footer } from "./Footer";
import { DisclaimerPill, ThemeToggle } from "./HeaderControls";
import { CapsuleIcon, KeyIcon, MenuIcon, ReviewIcon, SettingsIcon, SignOutIcon } from "./icons";
import { initials } from "./ui";

const ROLE_ICONS = { pharmacist: CapsuleIcon, expert: ReviewIcon, admin: KeyIcon } as const;

function RoleBadge({ role }: { role: Role }) {
  const Icon = ROLE_ICONS[role];
  return (
    <span className="inline-flex items-center gap-[5px] whitespace-nowrap rounded-full border border-accent bg-accent-weak px-2 py-0.5 text-xs font-semibold text-text">
      <Icon />
      {t(`role.${role}`)}
    </span>
  );
}

function AccountMenu({ user }: { user: User }) {
  const logout = useLogout();
  const navigate = useNavigate();
  const itemCls =
    "flex min-h-control items-center gap-2.5 rounded-inner px-3 py-2 text-body-sm text-text no-underline hover:bg-surface-2 hover:text-text";
  return (
    <details className="relative">
      <summary
        aria-label={t("account.menuFor", { name: user.full_name })}
        className="flex min-h-control cursor-pointer items-center gap-2.5 rounded-control border border-border-2 bg-surface py-1 pr-2.5 pl-1 hover:bg-surface-2"
      >
        <span
          aria-hidden="true"
          className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full bg-accent text-eyebrow font-bold text-on-accent"
        >
          {initials(user.full_name)}
        </span>
        <span className="flex flex-col items-start leading-[1.2]">
          <span className="text-sm font-semibold">{user.full_name}</span>
          <RoleBadge role={user.role} />
        </span>
      </summary>
      <div className="absolute top-[calc(100%+6px)] right-0 z-30 flex w-[260px] flex-col gap-0.5 rounded-control border border-border bg-surface p-2">
        <p className="m-0 border-b border-border px-3 pt-2 pb-2.5 text-eyebrow text-muted">
          {t("account.signedInAs")}
          <br />
          <span className="font-semibold break-all text-text">{user.email}</span>
        </p>
        <Link to="/settings" className={itemCls}>
          <SettingsIcon />
          {t("account.settings")}
        </Link>
        <button
          type="button"
          className={`${itemCls} w-full border-0 bg-transparent text-left`}
          onClick={() => logout.mutate(undefined, { onSettled: () => navigate("/sign-in") })}
        >
          <SignOutIcon />
          {t("account.signOut")}
        </button>
      </div>
    </details>
  );
}

export function AppShell({ user }: { user: User }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print relative z-20 border-b border-border bg-surface">
        <div className="mx-auto flex max-w-shell flex-wrap items-center gap-x-5 gap-y-2 px-6 py-2.5">
          <Brand to={ROLE_HOME[user.role]} />
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="main-nav"
            aria-label={t("nav.menu")}
            className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-control border border-border-2 bg-surface text-text md:hidden"
          >
            <MenuIcon />
          </button>
          <nav
            id="main-nav"
            aria-label={t("nav.main")}
            className={`${menuOpen ? "flex" : "hidden"} w-full min-w-0 flex-col gap-0.5 md:flex md:w-auto md:flex-auto md:flex-row md:flex-wrap`}
          >
            {navFor(user.role).map((item) => {
              const active = item.active ? item.active.test(pathname) : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={`inline-flex min-h-control items-center rounded-control px-3 py-2 text-body-sm no-underline hover:bg-surface-2 hover:text-text ${
                    active ? "bg-accent-weak font-semibold text-text" : "font-medium text-muted"
                  }`}
                >
                  {t(item.label)}
                </Link>
              );
            })}
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <DisclaimerPill />
            <ThemeToggle />
            <AccountMenu user={user} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-shell flex-[1_0_auto] px-6 pt-8 pb-16">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

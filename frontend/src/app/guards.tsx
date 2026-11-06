import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { PASSWORD_CHANGED, SESSION_FLAG, SIGNED_OUT_EVERYWHERE, useMe, type Role, type User } from "../api/auth";
import { AppShell } from "../components/AppShell";
import { t } from "../i18n";
import { ForbiddenPage } from "../pages/StatusPages";
import { ROLE_HOME } from "./navigation";

function Loading() {
  return (
    <p role="status" className="p-12 text-center text-muted">
      {t("app.loading")}
    </p>
  );
}

/** Signed-in area: renders the app shell, or sends the visitor to sign in. */
export function RequireAuth() {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <Loading />;
  if (!me.data) {
    const flag = localStorage.getItem(SESSION_FLAG);
    localStorage.removeItem(SESSION_FLAG);
    if (flag === PASSWORD_CHANGED) return <Navigate to="/sign-in?reset=done" replace />;
    if (flag === SIGNED_OUT_EVERYWHERE) return <Navigate to="/sign-in?everywhere=1" replace />;
    return (
      <Navigate
        to={`/sign-in${flag === "1" ? "?expired=1" : ""}`}
        replace
        state={{ from: location.pathname }}
      />
    );
  }
  return <AppShell user={me.data} />;
}

export function useCurrentUser(): User {
  const me = useMe();
  if (!me.data) throw new Error("useCurrentUser used outside RequireAuth");
  return me.data;
}

/** Restrict a route to some roles. Must be nested inside RequireAuth. */
export function RequireRole({ roles, children }: { roles: Role[]; children?: ReactNode }) {
  const user = useCurrentUser();
  if (!roles.includes(user.role)) return <ForbiddenPage user={user} />;
  return children ?? <Outlet />;
}

/** Public auth pages: if already signed in, go to the role's start page. */
export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.isPending) return <Loading />;
  if (me.data) return <Navigate to={ROLE_HOME[me.data.role]} replace />;
  return <>{children}</>;
}

export function HomeRedirect() {
  const me = useMe();
  if (me.isPending) return <Loading />;
  return <Navigate to={me.data ? ROLE_HOME[me.data.role] : "/sign-in"} replace />;
}

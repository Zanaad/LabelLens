import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useLogin } from "../api/auth";
import { errorCode } from "../api/client";
import { ROLE_HOME } from "../app/navigation";
import { AuthHeading, AuthLayout } from "../components/AuthLayout";
import { Button, Field, Notice, PasswordField } from "../components/ui";
import { t, type MessageKey } from "../i18n";

export function SignInPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const from = (location.state as { from?: string } | null)?.from;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    login.mutate(
      { email, password },
      { onSuccess: (user) => navigate(from ?? ROLE_HOME[user.role], { replace: true }) },
    );
  }

  return (
    <AuthLayout>
      <form onSubmit={onSubmit} className="flex flex-col gap-[18px]">
        <AuthHeading title={t("signIn.title")} intro={t("signIn.intro")} />
        {params.get("expired") === "1" && !login.isError && (
          <Notice tone="expired">{t("signIn.expired")}</Notice>
        )}
        {params.get("reset") === "done" && !login.isError && <Notice tone="success">{t("signIn.resetDone")}</Notice>}
        {params.get("everywhere") === "1" && !login.isError && (
          <Notice tone="success">{t("signIn.signedOutEverywhere")}</Notice>
        )}
        {login.isError && (
          <Notice tone="error">{t(`error.${errorCode(login.error)}` as MessageKey)}</Notice>
        )}
        <Field
          label={t("signIn.email")}
          type="email"
          autoComplete="email"
          placeholder={t("form.emailPlaceholder")}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <PasswordField
          label={t("signIn.password")}
          labelAside={
            <Link to="/forgot-password" className="inline-flex min-h-8 items-center text-body-sm">
              {t("signIn.forgot")}
            </Link>
          }
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" className="w-full text-[17px]" disabled={login.isPending}>
          {login.isPending ? t("form.submitting") : t("signIn.submit")}
        </Button>
        <p className="m-0 text-center">
          {t("signIn.newHere")} <Link to="/register">{t("signIn.createAccount")}</Link>
        </p>
        <p className="m-0 text-center text-body-sm">
          {t("signIn.invited")} <Link to="/accept-invite">{t("signIn.acceptInvite")}</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

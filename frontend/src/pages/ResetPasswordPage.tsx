import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useResetPassword } from "../api/auth";
import { errorCode } from "../api/client";
import { AuthHeading, AuthLayout } from "../components/AuthLayout";
import { Button, Notice, PasswordField } from "../components/ui";
import { t, type MessageKey } from "../i18n";

/** Reset links look like /reset-password#<token>; the fragment never reaches the server. */
export function ResetPasswordPage() {
  const token = decodeURIComponent(useLocation().hash.replace(/^#/, ""));
  const navigate = useNavigate();
  const reset = useResetPassword();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMismatch(password !== confirm);
    if (password !== confirm) return;
    reset.mutate({ token, password }, { onSuccess: () => navigate("/sign-in?reset=done", { replace: true }) });
  }

  return (
    <AuthLayout>
      <AuthHeading title={t("reset.title")} intro={t("reset.intro")} />
      {!token ? (
        <Notice tone="info">{t("reset.missing")}</Notice>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-[18px]">
          {mismatch && <Notice tone="error">{t("reset.mismatch")}</Notice>}
          {reset.isError && <Notice tone="error">{t(`error.${errorCode(reset.error)}` as MessageKey)}</Notice>}
          <PasswordField
            label={t("reset.password")}
            hint={t("form.passwordHint")}
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordField
            label={t("reset.confirm")}
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Button type="submit" disabled={reset.isPending}>
            {reset.isPending ? t("form.submitting") : t("reset.submit")}
          </Button>
        </form>
      )}
      <p className="m-0">
        <Link to="/forgot-password">{t("reset.again")}</Link>
      </p>
    </AuthLayout>
  );
}

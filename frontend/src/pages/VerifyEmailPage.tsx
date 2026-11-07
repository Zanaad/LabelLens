import { useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useVerifyEmail } from "../api/auth";
import { errorCode } from "../api/client";
import { AuthHeading, AuthLayout } from "../components/AuthLayout";
import { Notice } from "../components/ui";
import { t, type MessageKey } from "../i18n";

/** Confirmation links look like /verify-email#<token>; the fragment never reaches the server. */
export function VerifyEmailPage() {
  const token = decodeURIComponent(useLocation().hash.replace(/^#/, ""));
  const navigate = useNavigate();
  const verify = useVerifyEmail();
  const sent = useRef(false); // the link works once, so never send it twice

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    verify.mutate(token, { onSuccess: () => navigate("/onboarding", { replace: true }) });
  }, [token, verify, navigate]);

  return (
    <AuthLayout>
      <AuthHeading title={t("verify.title")} intro={t("verify.intro")} />
      {!token ? (
        <Notice tone="info">{t("verify.missing")}</Notice>
      ) : verify.isError ? (
        <Notice tone="error">{t(`error.${errorCode(verify.error)}` as MessageKey)}</Notice>
      ) : (
        <p role="status" className="m-0 text-muted">
          {t("verify.working")}
        </p>
      )}
      <p className="m-0">
        <Link to="/sign-in">{t("verify.signIn")}</Link>
      </p>
    </AuthLayout>
  );
}

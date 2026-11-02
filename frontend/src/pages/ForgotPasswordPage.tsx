import { Link } from "react-router-dom";
import { AuthHeading, AuthLayout } from "../components/AuthLayout";
import { t } from "../i18n";

export function ForgotPasswordPage() {
  return (
    <AuthLayout>
      <AuthHeading title={t("forgot.title")} intro={t("forgot.body")} />
      <p className="m-0">
        <Link to="/sign-in">{t("forgot.back")}</Link>
      </p>
    </AuthLayout>
  );
}

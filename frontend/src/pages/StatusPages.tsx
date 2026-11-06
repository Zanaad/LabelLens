import { useMe, type User } from "../api/auth";
import { ROLE_HOME } from "../app/navigation";
import { ButtonLink, Eyebrow } from "../components/ui";
import { t, type MessageKey } from "../i18n";

export function PlaceholderPage({ title }: { title: MessageKey }) {
  return (
    <section className="flex flex-col gap-3">
      <h1 className="m-0 text-page font-semibold">{t(title)}</h1>
      <p className="m-0 text-muted">{t("placeholder.body")}</p>
    </section>
  );
}

export function ForbiddenPage({ user }: { user: User }) {
  return (
    <section className="flex max-w-[60ch] flex-col items-start gap-4">
      <Eyebrow>{t("forbidden.eyebrow")}</Eyebrow>
      <h1 className="m-0 text-page font-semibold">{t("forbidden.title")}</h1>
      <p className="m-0">{t("forbidden.signedInAs", { name: user.full_name, role: t(`role.${user.role}`) })}</p>
      <p className="m-0 text-muted">{t("forbidden.body")}</p>
      <div className="flex flex-wrap gap-3">
        <ButtonLink to={ROLE_HOME[user.role]}>{t("notFound.back")}</ButtonLink>
        {user.role === "pharmacist" && (
          <ButtonLink to="/scans" variant="secondary">
            {t("forbidden.myScans")}
          </ButtonLink>
        )}
      </div>
    </section>
  );
}

export function NotFoundPage() {
  const me = useMe();
  return (
    <section className="mx-auto flex max-w-[60ch] flex-col items-start gap-4 p-12">
      <h1 className="m-0 text-page font-semibold">{t("notFound.title")}</h1>
      <ButtonLink to={me.data ? ROLE_HOME[me.data.role] : "/sign-in"} variant="secondary">
        {t("notFound.back")}
      </ButtonLink>
    </section>
  );
}

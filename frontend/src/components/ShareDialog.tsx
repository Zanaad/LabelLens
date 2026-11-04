import { useId, useState } from "react";
import { errorCode } from "../api/client";
import { useCreateShare } from "../api/scans";
import { formatDateTime, t, type MessageKey } from "../i18n";
import { CloseIcon, CopyIcon, EyeIcon, InfoIcon, ShareIcon } from "./icons";
import { Button, Notice, inputClass } from "./ui";

const DAYS = [1, 7, 30] as const;

// Creates a read-only patient link; the token is shown once and lives only in the URL fragment.
export function ShareDialog({ scanId, name, onClose }: { scanId: string; name: string; onClose: () => void }) {
  const id = useId();
  const create = useCreateShare(scanId);
  const [days, setDays] = useState<(typeof DAYS)[number]>(7);
  const [copied, setCopied] = useState(false);
  const link = create.data && `${window.location.origin}/p#${create.data.token}`;

  const copy = () => {
    if (link) navigator.clipboard?.writeText(link).catch(() => {});
    setCopied(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <button type="button" aria-label={t("share.close")} onClick={onClose} className="absolute inset-0 cursor-default border-0 bg-backdrop p-0" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className="relative flex w-full max-w-[520px] flex-col gap-4 rounded-control border border-border bg-surface p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id={`${id}-title`} className="m-0 flex items-center gap-2.5 text-xl font-semibold">
            <ShareIcon />
            {t("share.title")}
          </h2>
          <Button variant="secondary" autoFocus aria-label={t("share.close")} onClick={onClose} className="w-11 px-0">
            <CloseIcon />
          </Button>
        </div>
        <p className="m-0">
          <strong>{name}</strong>. {t("share.intro")}
        </p>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-days`} className="font-semibold">
            {t("share.expires")}
          </label>
          <div className="flex flex-wrap gap-2">
            <select
              id={`${id}-days`}
              value={days}
              onChange={(e) => {
                setDays(Number(e.target.value) as typeof days);
                create.reset(); // a new expiry needs a new link
                setCopied(false);
              }}
              className={`${inputClass} w-auto flex-auto`}
            >
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {t(`share.days${d}` as MessageKey)}
                </option>
              ))}
            </select>
            {!link && (
              <Button disabled={create.isPending} onClick={() => create.mutate(days)}>
                {t("share.create")}
              </Button>
            )}
          </div>
        </div>

        {link && create.data && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-url`} className="font-semibold">
              {t("share.link")}
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id={`${id}-url`}
                readOnly
                value={link}
                onFocus={(e) => e.target.select()}
                className={`${inputClass} min-w-0 flex-[1_1_260px] bg-surface-2 font-mono text-body-sm`}
              />
              <Button onClick={copy}>
                <CopyIcon />
                {copied ? t("share.copied") : t("share.copy")}
              </Button>
            </div>
            <span className="text-sm text-muted">
              {t("share.expiresOn", { date: formatDateTime(create.data.expires_at) })}
            </span>
            <span aria-live="polite" className="min-h-[21px] text-sm text-match-fg">
              {copied ? t("share.copiedNote") : ""}
            </span>
          </div>
        )}
        {create.isError && <Notice tone="error">{t(`error.${errorCode(create.error)}` as MessageKey)}</Notice>}

        <p className="m-0 flex items-start gap-2 rounded-control border border-border bg-surface-2 px-3 py-2.5 text-sm">
          <InfoIcon />
          {t("share.noPatientData")}
        </p>
        <div className="flex flex-wrap justify-between gap-3">
          {link ? (
            <a href={link} target="_blank" rel="noreferrer" className="inline-flex min-h-control items-center gap-2 font-medium">
              <EyeIcon />
              {t("share.preview")}
            </a>
          ) : (
            <span />
          )}
          <Button variant="secondary" onClick={onClose}>
            {t("share.done")}
          </Button>
        </div>
      </div>
    </div>
  );
}

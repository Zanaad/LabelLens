import { useState, type FormEvent } from "react";
import { errorCode } from "../api/client";
import { useAskExpert, type Verdict } from "../api/scans";
import { formatDateTime, t, type MessageKey } from "../i18n";
import { ReviewIcon } from "./icons";
import { Button, Notice, inputClass } from "./ui";

// Lets the pharmacist flag an uncertain result; shared by the result card and scan detail page.
export function AskExpert({ scanId, verdict }: { scanId: string; verdict: Verdict }) {
  const ask = useAskExpert(scanId);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");

  if (verdict.review_requested_at) {
    return (
      <div className="flex flex-col gap-1 rounded-control border border-border bg-surface-2 p-4 text-body-sm">
        <p className="m-0 inline-flex items-center gap-2 font-semibold">
          <ReviewIcon size={18} />
          {t("ask.sent", { date: formatDateTime(verdict.review_requested_at) })}
        </p>
        {verdict.review_question && <p className="m-0 text-muted">“{verdict.review_question}”</p>}
      </div>
    );
  }

  if (!open) {
    return (
      <Button variant="secondary" className="justify-start" onClick={() => setOpen(true)}>
        <ReviewIcon size={20} />
        {t("ask.button")}
      </Button>
    );
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    ask.mutate(question.trim() || null);
  };
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-control border border-border p-4">
      {ask.isError && <Notice tone="error">{t(`error.${errorCode(ask.error)}` as MessageKey)}</Notice>}
      <label className="flex flex-col gap-1.5 font-semibold">
        <span>
          {t("ask.question")} <span className="font-normal text-muted">{t("form.optional")}</span>
        </span>
        <textarea rows={3} maxLength={1000} value={question} onChange={(e) => setQuestion(e.target.value)} className={`${inputClass} font-normal`} />
        <span className="text-sm font-normal text-muted">{t("ask.hint")}</span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={ask.isPending}>
          {t("ask.send")}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          {t("ref.cancel")}
        </Button>
      </div>
    </form>
  );
}

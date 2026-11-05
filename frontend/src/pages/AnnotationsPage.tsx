import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  useAnnotation,
  useAnnotations,
  useCreateAnnotation,
  useDeleteAnnotation,
  useSaveAnnotation,
  type Annotation,
  type AnnotationStatus,
} from "../api/admin";
import { errorCode } from "../api/client";
import { FIELD_KEYS, type FieldKey, type VerdictCode } from "../api/scans";
import { ArrowLeftIcon, UploadIcon } from "../components/icons";
import { Button, ButtonLink, Notice, inputClass } from "../components/ui";
import { VERDICT_OPTIONS, VerdictChip } from "../components/verdict";
import { formatDateTime, t, type MessageKey } from "../i18n";
import { AdminTabs } from "./AdminPage";
import { NotFoundPage } from "./StatusPages";

const panel = "flex min-w-0 flex-col gap-4 rounded-control border border-border bg-surface"; // tables run edge to edge
const card = `${panel} p-6`;
const STATUSES: AnnotationStatus[] = ["draft", "in_review", "final"];

function AddLabel() {
  const navigate = useNavigate();
  const create = useCreateAnnotation();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const open = (a: Annotation) => navigate(`/admin/annotations/${a.id}`);

  const onText = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({ text }, { onSuccess: open });
  };

  return (
    <section aria-labelledby="add-title" className={card}>
      <h2 id="add-title" className="m-0 text-xl font-semibold">
        {t("annot.add")}
      </h2>
      {create.isError && <Notice tone="error">{t(`error.${errorCode(create.error)}` as MessageKey)}</Notice>}
      <div>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png"
          className="sr-only"
          aria-label={t("annot.upload")}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) create.mutate({ file }, { onSuccess: open });
          }}
        />
        <Button disabled={create.isPending} onClick={() => fileInput.current?.click()}>
          <UploadIcon />
          {t("annot.upload")}
        </Button>
      </div>
      <form onSubmit={onText} className="flex flex-col gap-2">
        <label htmlFor="annot-text" className="font-semibold">
          {t("annot.pasteLabel")}
        </label>
        <textarea
          id="annot-text"
          rows={4}
          minLength={10}
          maxLength={5000}
          required
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={`${inputClass} font-mono text-sm`}
        />
        <Button type="submit" variant="secondary" className="self-start" disabled={create.isPending}>
          {t("annot.pasteSubmit")}
        </Button>
      </form>
    </section>
  );
}

export function AnnotationsPage() {
  const list = useAnnotations();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="m-0 text-page font-semibold">{t("admin.title")}</h1>
      <AdminTabs />
      <p className="m-0 max-w-[75ch] text-muted">{t("annot.intro")}</p>
      <div className="flex flex-wrap items-start gap-6">
        <section aria-labelledby="list-title" className={`${panel} flex-[2_1_560px]`}>
          <h2 id="list-title" className="m-0 px-6 pt-6 text-xl font-semibold">
            {t("annot.title")}
          </h2>
          {list.data?.length === 0 ? (
            <p className="m-0 px-6 pb-6 text-muted">{t("annot.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-body-sm">
                <thead>
                  <tr className="bg-surface-2">
                    {(["colTitle", "colStatus", "colExpected", "colUpdated"] as const).map((k) => (
                      <th key={k} scope="col" className="border-b border-border px-3 py-2.5 text-left font-semibold first:pl-6 last:pr-6">
                        {t(`annot.${k}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.data?.map((a) => (
                    <tr key={a.id} className="hover:bg-surface-2">
                      <th scope="row" className="border-b border-border py-2.5 pr-3 pl-6 text-left font-semibold">
                        <Link to={`/admin/annotations/${a.id}`} className="text-text">
                          {a.title}
                        </Link>
                      </th>
                      <td className="border-b border-border px-3 py-2.5">{t(`annot.status.${a.status}`)}</td>
                      <td className="border-b border-border px-3 py-2.5">
                        {a.expected_verdict ? (
                          <VerdictChip verdict={a.expected_verdict} internal />
                        ) : (
                          <span className="text-muted">{t("annot.notSet")}</span>
                        )}
                      </td>
                      <td className="border-b border-border py-2.5 pr-6 pl-3 whitespace-nowrap">{formatDateTime(a.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <div className="flex-[1_1_320px]">
          <AddLabel />
        </div>
      </div>
    </div>
  );
}

function Editor({ annotation }: { annotation: Annotation }) {
  const navigate = useNavigate();
  const save = useSaveAnnotation(annotation.id);
  const remove = useDeleteAnnotation(annotation.id);
  const [form, setForm] = useState({
    title: annotation.title,
    fields: Object.fromEntries(FIELD_KEYS.map((k) => [k, annotation.fields[k] ?? ""])) as Record<FieldKey, string>,
    expected_verdict: (annotation.expected_verdict ?? "") as VerdictCode | "",
    status: annotation.status,
    notes: annotation.notes ?? "",
  });
  const error = save.error ?? remove.error;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate({
      title: form.title,
      fields: Object.fromEntries(FIELD_KEYS.map((k) => [k, form.fields[k].trim() || null])) as Record<FieldKey, string | null>,
      expected_verdict: form.expected_verdict || null,
      status: form.status,
      notes: form.notes.trim() || null,
    });
  };
  const del = () => {
    if (window.confirm(t("annot.deleteConfirm"))) remove.mutate(undefined, { onSuccess: () => navigate("/admin/annotations") });
  };

  return (
    <div className="flex flex-wrap items-start gap-6">
      <section aria-labelledby="label-title" className={`${card} flex-[1_1_380px]`}>
        <h2 id="label-title" className="m-0 text-xl font-semibold">
          {t("queue.labelTitle")}
        </h2>
        <div className="flex justify-center rounded-control bg-photo p-4">
          {annotation.has_image ? (
            <img
              src={`/api/annotations/${annotation.id}/image`}
              alt={t("review.imageAlt")}
              className="max-h-[640px] max-w-full rounded-inner object-contain"
            />
          ) : (
            <pre className="m-0 w-full rounded-inner bg-surface p-5 font-mono text-sm whitespace-pre-wrap">{annotation.label_text}</pre>
          )}
        </div>
      </section>

      <form onSubmit={onSubmit} aria-labelledby="edit-title" className={`${card} flex-[1.3_1_520px]`}>
        <h2 id="edit-title" className="m-0 text-xl font-semibold">
          {t("annot.editTitle")}
        </h2>
        {annotation.status === "draft" && (
          <Notice>{annotation.prefilled ? t("annot.prefilled") : t("annot.notPrefilled")}</Notice>
        )}
        {error && <Notice tone="error">{t(`error.${errorCode(error)}` as MessageKey)}</Notice>}
        <label className="flex flex-col gap-1.5 font-semibold">
          {t("annot.name")}
          <input
            required
            maxLength={200}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className={`${inputClass} font-normal`}
          />
        </label>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 p-0 text-lg font-semibold">{t("annot.fieldsTitle")}</legend>
          <p className="m-0 text-sm text-muted">{t("annot.fieldsHint")}</p>
          {FIELD_KEYS.map((k) => (
            <label key={k} className="grid grid-cols-[minmax(150px,34%)_minmax(0,1fr)] items-center gap-x-4 gap-y-1 text-body-sm">
              <span className="font-semibold">{t(`field.${k}` as MessageKey)}</span>
              <input
                maxLength={500}
                value={form.fields[k]}
                placeholder={t("review.notStated")}
                onChange={(e) => setForm({ ...form, fields: { ...form.fields, [k]: e.target.value } })}
                className={inputClass}
              />
            </label>
          ))}
        </fieldset>

        <div className="flex flex-wrap gap-4">
          <label className="flex flex-[1_1_240px] flex-col gap-1.5 font-semibold">
            {t("annot.expected")}
            <select
              value={form.expected_verdict}
              onChange={(e) => setForm({ ...form, expected_verdict: e.target.value as VerdictCode | "" })}
              className={`${inputClass} font-normal`}
            >
              <option value="">{t("annot.notSet")}</option>
              {VERDICT_OPTIONS.map(([v, label]) => (
                <option key={v} value={v}>
                  {t(label)}
                </option>
              ))}
            </select>
            <span className="text-sm font-normal text-muted">{t("annot.expectedHint")}</span>
          </label>
          <label className="flex flex-[1_1_180px] flex-col gap-1.5 font-semibold">
            {t("annot.status")}
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as AnnotationStatus })}
              className={`${inputClass} font-normal`}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`annot.status.${s}`)}
                </option>
              ))}
            </select>
            <span className="text-sm font-normal text-muted">{t("annot.statusHint")}</span>
          </label>
        </div>
        <label className="flex flex-col gap-1.5 font-semibold">
          {t("annot.notes")}
          <textarea
            rows={3}
            maxLength={2000}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className={`${inputClass} font-normal`}
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="secondary" disabled={remove.isPending} onClick={del}>
            {t("annot.delete")}
          </Button>
          <div className="flex items-center gap-3">
            <span aria-live="polite" className="text-sm text-match-fg">
              {save.isSuccess ? t("annot.saved") : ""}
            </span>
            <Button type="submit" disabled={save.isPending}>
              {t("annot.save")}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function AnnotationEditorPage() {
  const { id = "" } = useParams();
  const annotation = useAnnotation(id);
  if (annotation.isError) return <NotFoundPage />;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="m-0 text-page font-semibold">{t("admin.title")}</h1>
      <AdminTabs />
      <ButtonLink to="/admin/annotations" variant="secondary" className="self-start">
        <ArrowLeftIcon />
        {t("annot.back")}
      </ButtonLink>
      {annotation.isPending ? (
        <p role="status" className="text-muted">
          {t("app.loading")}
        </p>
      ) : (
        <Editor key={annotation.data.id} annotation={annotation.data} />
      )}
    </div>
  );
}

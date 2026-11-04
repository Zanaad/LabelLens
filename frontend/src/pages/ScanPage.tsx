import { useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { ApiError, errorCode } from "../api/client";
import { FIELD_KEYS, useCreateScan, type Scan } from "../api/scans";
import {
  ArrowRightIcon,
  CameraIcon,
  CapsuleIcon,
  LockIcon,
  TextIcon,
  UploadIcon,
  WarningIcon,
} from "../components/icons";
import { Button, ButtonLink, Eyebrow, Notice } from "../components/ui";
import { t, type MessageKey } from "../i18n";

// Fictional example labels (from the design). Their saved readings live in data/extraction_cache.
const EXAMPLES: { name: MessageKey; desc: MessageKey; text: string }[] = [
  {
    name: "scan.ex1Name",
    desc: "scan.ex1Desc",
    text: "HYPERIA 300\nSt John's wort\nHerb extract · 300 mg per capsule\n60 capsules · Food supplement\nStandardised to 0.3% total hypericins\nIngredients: St John's wort herb extract, microcrystalline cellulose, gelatin (capsule shell), magnesium stearate, colour: iron oxide (E172).\nLOT HP2409-17     EXP 03/2028",
  },
  {
    name: "scan.ex2Name",
    desc: "scan.ex2Desc",
    text: "GINKGOVITA 120\nGinkgo biloba leaf extract\nFilm-coated tablets · 120 mg dry extract per tablet\nExtract ratio 35–67:1 · Extraction solvent: acetone 60% (m/m)\nQuantified to 22–27% flavonoids (as flavone glycosides) and 5–7% terpene lactones\nOther ingredients: lactose monohydrate, microcrystalline cellulose, maize starch, hypromellose, magnesium stearate, colour: iron oxide (E172).\nBatch GB-55102     Use by 11/2027",
  },
  {
    name: "scan.ex3Name",
    desc: "scan.ex3Desc",
    text: "MEADOW CUP\nChamomile tea\n100% chamomile flowers\n20 tea bags × 1.5 g\nPour on freshly boiled water.\nBest before 08/2027",
  },
];

const card = "rounded-control border bg-surface";

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function StateBox({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div role="alert" className={`${card} flex min-h-[380px] flex-col gap-4 border-cannot-bd p-8`}>
      <div className="flex items-center gap-3 text-cannot-fg">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-cannot-bg">{icon}</span>
        <h2 className="m-0 text-[22px] leading-[1.3] font-semibold text-text">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export function ScanPage() {
  const create = useCreateScan();
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState("");
  const [source, setSource] = useState<{ name: string; size?: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const submit = (input: { file: File } | { text: string }) => {
    setSource("file" in input ? { name: input.file.name, size: input.file.size } : { name: t("scan.pastedText") });
    create.mutate(input);
  };
  const reset = () => {
    create.reset();
    setSource(null);
  };
  const onFiles = (files: FileList | null) => {
    if (files?.[0]) submit({ file: files[0] });
  };
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    onFiles(e.target.files);
    e.target.value = ""; // allow picking the same file again
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    onFiles(e.dataTransfer.files);
  };

  const code = create.isError ? errorCode(create.error) : null;
  const unreadable = create.error instanceof ApiError && create.error.code === "label_unreadable";
  const scan: Scan | undefined = create.data;

  let body: ReactNode;
  if (create.isPending || scan?.status === "extracted") {
    const found = FIELD_KEYS.filter((k) => scan?.fields[k]?.status === "stated").length;
    const missing = FIELD_KEYS.filter((k) => scan?.fields[k]?.status === "not_stated").length;
    body = (
      <div className={`${card} flex min-h-[380px] flex-col justify-center gap-5 border-border px-6 py-8`}>
        <div>
          <p className="m-0 font-semibold">{source?.name}</p>
          <p className="m-0 text-sm text-muted">
            {source?.size ? t("scan.savedHint", { size: formatSize(source.size) }) : t("app.privacyNote")}
          </p>
        </div>
        {create.isPending ? (
          <div role="status" className="flex flex-col gap-2">
            <span className="font-semibold">{t("scan.reading")}</span>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
            </div>
            <span className="text-sm text-muted">{t("scan.readingHint")}</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-match-bd bg-match-bg p-4">
            <p className="m-0 font-semibold text-match-fg">{t("scan.done", { found, missing })}</p>
            <ButtonLink to={`/scans/${scan!.id}/review`}>
              {t("scan.review")}
              <ArrowRightIcon />
            </ButtonLink>
          </div>
        )}
        {!create.isPending && (
          <Button variant="secondary" className="self-start" onClick={reset}>
            {t("scan.cancel")}
          </Button>
        )}
      </div>
    );
  } else if (unreadable) {
    body = (
      <StateBox icon={<WarningIcon />} title={t("scan.unreadableTitle")}>
        <p className="m-0 max-w-[60ch] text-muted">{t("scan.unreadableBody")}</p>
        <ul className="m-0 flex flex-col gap-1.5 pl-5">
          {(["scan.tip1", "scan.tip2", "scan.tip3", "scan.tip4"] as const).map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => (reset(), fileInput.current?.click())}>
            <CameraIcon />
            {t("scan.retry")}
          </Button>
          <Button variant="secondary" onClick={() => (reset(), setPaste(true))}>
            <TextIcon />
            {t("scan.pasteToggle")}
          </Button>
        </div>
      </StateBox>
    );
  } else if (scan?.status === "out_of_scope") {
    body = (
      <StateBox icon={<CapsuleIcon size={24} />} title={t("scan.scopeTitle")}>
        <p className="m-0 max-w-[62ch]">
          {scan.product_name ? t("scan.scopeBody", { product: scan.product_name }) : t("scan.scopeBodyUnnamed")}
        </p>
        <div className="flex flex-col gap-1.5 rounded-control border border-border bg-surface-2 p-4">
          <p className="m-0 font-semibold">{t("scan.scopeHerbTitle")}</p>
          <p className="m-0 text-muted">{t("scan.scopeHerbBody")}</p>
        </div>
        <Button className="self-start" onClick={reset}>
          {t("scan.scopeAgain")}
        </Button>
      </StateBox>
    );
  } else {
    body = (
      <>
        {code && <Notice tone="error">{t(`error.${code}` as MessageKey)}</Notice>}
        <div
          onDragOver={(e) => (e.preventDefault(), setDragging(true))}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`${card} flex min-h-[380px] flex-col items-center justify-center gap-4 border-2 border-dashed px-6 py-10 text-center ${
            dragging ? "border-accent bg-accent-weak" : "border-border-2"
          }`}
        >
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-accent-weak text-accent">
            <UploadIcon size={30} />
          </span>
          <h2 className="m-0 text-[22px] leading-[1.3] font-semibold">{t("scan.dropTitle")}</h2>
          <p className="m-0 max-w-[46ch] text-muted">{t("scan.dropHint")}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={() => fileInput.current?.click()}>
              <UploadIcon />
              {t("scan.choose")}
            </Button>
            <Button variant="secondary" onClick={() => cameraInput.current?.click()}>
              <CameraIcon />
              {t("scan.take")}
            </Button>
          </div>
          <button
            type="button"
            aria-expanded={paste}
            onClick={() => setPaste(!paste)}
            className="inline-flex min-h-control items-center gap-2 rounded-control border-0 bg-transparent px-3 py-2.5 font-medium text-link underline underline-offset-[3px]"
          >
            <TextIcon />
            {t("scan.pasteToggle")}
          </button>
        </div>
        {paste && (
          <form
            className={`${card} flex flex-col gap-3 border-border p-6`}
            onSubmit={(e) => (e.preventDefault(), submit({ text }))}
          >
            <label htmlFor="paste-text" className="font-semibold">
              {t("scan.pasteLabel")}
            </label>
            <textarea
              id="paste-text"
              rows={5}
              required
              minLength={10}
              maxLength={5000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("scan.pastePlaceholder")}
              className="w-full resize-y rounded-control border border-border-2 bg-surface p-3 text-base"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit">
                {t("scan.pasteSubmit")}
                <ArrowRightIcon />
              </Button>
              <span className="text-sm text-muted">{t("scan.pasteHint")}</span>
            </div>
          </form>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2 pt-2">
        <Eyebrow>{t("scan.eyebrow")}</Eyebrow>
        <h1 className="m-0 max-w-[26ch] text-4xl leading-[1.15] font-semibold tracking-[-0.015em] text-balance">
          {t("scan.title")}
        </h1>
        <p className="m-0 max-w-[64ch] text-lg text-muted">{t("scan.intro")}</p>
      </section>

      <div className="flex flex-wrap items-stretch gap-6">
        <section aria-label={t("scan.uploadLabel")} className="flex min-w-0 flex-[3_1_520px] flex-col gap-3">
          {body}
        </section>
        <aside className="flex min-w-0 flex-[2_1_300px] flex-col gap-4">
          <section className={`${card} flex flex-col gap-3.5 border-border p-6`}>
            <h2 className="m-0 text-lg font-semibold">{t("scan.howTitle")}</h2>
            <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
              {(
                [
                  ["scan.how1", "scan.how1Body"],
                  ["scan.how2", "scan.how2Body"],
                  ["scan.how3", "scan.how3Body"],
                ] as const
              ).map(([title, desc], i) => (
                <li key={title} className="flex gap-3">
                  <span className="inline-flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-accent-weak font-bold text-accent">
                    {i + 1}
                  </span>
                  <div>
                    <p className="m-0 font-semibold">{t(title)}</p>
                    <p className="m-0 text-sm text-muted">{t(desc)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section className={`${card} flex flex-col gap-2 border-border p-6`}>
            <h2 className="m-0 text-lg font-semibold">{t("scan.scopeHeading")}</h2>
            <p className="m-0">{t("scan.scopeNote")}</p>
            <p className="m-0 flex items-start gap-2 text-sm text-muted">
              <LockIcon />
              {t("app.privacyNote")}
            </p>
          </section>
        </aside>
      </div>

      <section aria-labelledby="ex-title" className="flex flex-col gap-3">
        <div>
          <h2 id="ex-title" className="m-0 text-xl font-semibold">
            {t("scan.examplesTitle")}
          </h2>
          <p className="m-0 text-muted">{t("scan.examplesIntro")}</p>
        </div>
        <div className="flex flex-wrap gap-4">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.name}
              type="button"
              disabled={create.isPending}
              onClick={() => (window.scrollTo({ top: 0, behavior: "smooth" }), submit({ text: ex.text }))}
              className={`${card} flex min-w-0 flex-[1_1_260px] flex-col items-start gap-1 border-border p-5 text-left hover:bg-surface-2`}
            >
              <span className="font-semibold">{t(ex.name)}</span>
              <span className="text-sm text-muted">{t(ex.desc)}</span>
              <span className="mt-2 inline-flex items-center gap-1.5 font-semibold text-link">
                {t("scan.exampleTry")}
                <ArrowRightIcon />
              </span>
            </button>
          ))}
        </div>
      </section>

      <input ref={fileInput} type="file" accept="image/jpeg,image/png" hidden onChange={onPick} />
      <input ref={cameraInput} type="file" accept="image/jpeg,image/png" capture="environment" hidden onChange={onPick} />
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { FieldKey, VerdictCode } from "./scans";

export type Rate = { correct: number; total: number; accuracy: number | null; ci: [number, number] | null };
export type Confusion = Record<VerdictCode, Record<VerdictCode, number>>;
export type VerdictRate = Rate & { confusion: Confusion };
export type FieldRate = Rate & { wrong: number; missed: number; invented: number };

export type Metrics = {
  versions: { rules: string; prompt: string; plain_prompt: string; model: string };
  dataset: {
    labels: number;
    with_expected_verdict: number;
    read: number;
    not_read: string[];
    include_drafts: boolean;
  };
  fields: Record<FieldKey, FieldRate>;
  verdicts: { rules_only: VerdictRate; end_to_end: VerdictRate };
  baselines: { keyword: VerdictRate; plain_model: VerdictRate & { fields: Record<FieldKey, FieldRate> } };
  expert_ratings: VerdictRate & { agree: number; disagree: number; unsure: number };
  failures: {
    id: string;
    title: string;
    expected: VerdictCode | null;
    rules_only: VerdictCode;
    end_to_end: VerdictCode | null;
    field_errors: { field: FieldKey; correct: string | null; read: string | null }[];
  }[];
};

export type RunSummary = {
  id: string;
  created_at: string;
  rules_version: string;
  prompt_version: string | null;
  dataset_size: number;
  include_drafts: boolean;
  end_to_end: number | null;
  rules_only: number | null;
};
export type Run = RunSummary & { started_by: string | null; metrics: Metrics };

const runsKey = ["validation", "runs"] as const;

export function useRuns() {
  return useQuery({ queryKey: runsKey, queryFn: () => api<RunSummary[]>("/api/validation/runs") });
}

export function useRun(id: string | undefined) {
  return useQuery({
    queryKey: [...runsKey, id],
    queryFn: () => api<Run>(`/api/validation/runs/${id}`),
    enabled: id !== undefined,
  });
}

export function useStartRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (include_drafts: boolean) => api<Run>("/api/validation/runs", { method: "POST", json: { include_drafts } }),
    onSuccess: (run) => {
      qc.setQueryData([...runsKey, run.id], run);
      void qc.invalidateQueries({ queryKey: runsKey, exact: true });
    },
  });
}

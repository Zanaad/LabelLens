import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

export type PreparationInput = {
  herb_latin: string;
  plant_part: string;
  preparation_type: string;
  extract_ratio_min: number | null;
  extract_ratio_max: number | null;
  solvent_type: string | null;
  solvent_strength: string | null;
  evidence_level: string | null;
  source_doc: string | null;
  source_section: string | null;
  source_url: string | null;
  verified: boolean;
  notes: string | null;
};
export type Preparation = PreparationInput & { id: string; updated_at: string };

export type PlantNameInput = { name: string; language: string; latin_name: string; verified: boolean; notes: string | null };
export type PlantName = PlantNameInput & { id: string };

export type ReferenceChange = {
  action: "create" | "update" | "delete" | "import" | "check" | "uncheck";
  by: string | null;
  at: string;
  before: Partial<PreparationInput> | null;
  after: Partial<PreparationInput> | null;
};

const referenceKey = ["reference"] as const;

export function useReference() {
  return useQuery({
    queryKey: referenceKey,
    queryFn: () => api<{ preparations: Preparation[]; plant_names: PlantName[] }>("/api/reference"),
  });
}

export function usePreparationHistory(id: string | null) {
  return useQuery({
    queryKey: [...referenceKey, "history", id],
    queryFn: () => api<ReferenceChange[]>(`/api/reference/preparations/${id}/history`),
    enabled: id !== null,
  });
}

// Experts only: one hook for create/update/delete of both tables; the list is refetched after.
export function useSaveReference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      table,
      id,
      body,
    }: {
      table: "preparations" | "plant-names";
      id: string | null;
      body: PreparationInput | PlantNameInput | null;
    }) => {
      const url = `/api/reference/${table}${id ? `/${id}` : ""}`;
      if (body === null) return api<void>(url, { method: "DELETE" });
      return api<unknown>(url, { method: id ? "PUT" : "POST", json: body });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: referenceKey }),
  });
}

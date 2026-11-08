import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Role } from "./auth";
import { api } from "./client";
import type { FieldKey, VerdictCode } from "./scans";

export type AdminUser = {
  id: string;
  email: string;
  full_name: string;
  organisation: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
};

export type Invitation = {
  id: string;
  email: string;
  role: Role;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type AnnotationStatus = "draft" | "in_review" | "final";

export type AnnotationItem = {
  id: string;
  title: string;
  status: AnnotationStatus;
  expected_verdict: VerdictCode | null;
  has_image: boolean;
  updated_at: string;
};

// Validation labels: experts only, since they are the answer key.
export type AnnotationInput = {
  title: string;
  fields: Record<FieldKey, string | null>;
  expected_verdict: VerdictCode | null;
  status: AnnotationStatus;
  notes: string | null;
  fields_checked: boolean;
};

export type Annotation = AnnotationInput & {
  id: string;
  label_text: string | null;
  has_image: boolean;
  updated_at: string;
  annotator: string | null;
  checked_by: string | null;
  checked_at: string | null;
  expected_by: string | null;
  expected_at: string | null;
  prefilled: boolean;
};

const usersKey = ["admin", "users"] as const;
const invitationsKey = ["admin", "invitations"] as const;
const annotationsKey = ["annotations"] as const;

export function useUsers() {
  return useQuery({ queryKey: usersKey, queryFn: () => api<AdminUser[]>("/api/admin/users") });
}

export function useSetUserActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api<AdminUser>(`/api/admin/users/${id}`, { method: "PATCH", json: { is_active } }),
    onSuccess: (user) => qc.setQueryData<AdminUser[]>(usersKey, (all) => all?.map((u) => (u.id === user.id ? user : u))),
  });
}

export function useSendPasswordReset() {
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/admin/users/${id}/password-reset`, { method: "POST" }),
  });
}

export function useInvitations() {
  return useQuery({ queryKey: invitationsKey, queryFn: () => api<Invitation[]>("/api/invitations") });
}

export function useRevokeInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<Invitation>(`/api/invitations/${id}/revoke`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: invitationsKey }),
  });
}

export function useAnnotations() {
  return useQuery({ queryKey: annotationsKey, queryFn: () => api<AnnotationItem[]>("/api/annotations") });
}

export function useAnnotation(id: string) {
  return useQuery({ queryKey: [...annotationsKey, id], queryFn: () => api<Annotation>(`/api/annotations/${id}`) });
}

export function useCreateAnnotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { file: File } | { text: string }) => {
      if ("file" in input) {
        const body = new FormData();
        body.append("file", input.file);
        return api<Annotation>("/api/annotations/image", { method: "POST", body });
      }
      return api<Annotation>("/api/annotations/text", { method: "POST", json: { text: input.text } });
    },
    onSuccess: (a) => {
      qc.setQueryData([...annotationsKey, a.id], a);
      void qc.invalidateQueries({ queryKey: annotationsKey, exact: true });
    },
  });
}

export function useSaveAnnotation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AnnotationInput) => api<Annotation>(`/api/annotations/${id}`, { method: "PUT", json: body }),
    onSuccess: (a) => {
      qc.setQueryData([...annotationsKey, id], a);
      void qc.invalidateQueries({ queryKey: annotationsKey, exact: true });
    },
  });
}

export function useDeleteAnnotation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(`/api/annotations/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.removeQueries({ queryKey: [...annotationsKey, id] });
      void qc.invalidateQueries({ queryKey: annotationsKey, exact: true });
    },
  });
}

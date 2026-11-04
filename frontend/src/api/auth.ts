import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./client";

export type Role = "pharmacist" | "expert" | "admin";

export type User = {
  id: string;
  email: string;
  full_name: string;
  organisation: string | null;
  role: Role;
  onboarded_at: string | null;
};

export type RegisterInput = {
  full_name: string;
  email: string;
  password: string;
  organisation?: string;
  accept_privacy: boolean;
  accept_terms: boolean;
};

export type InvitationPreview = { email: string; role: Role; expires_at: string };
export type InvitationCreated = InvitationPreview & { id: string; token: string; accept_path: string };

const ME_KEY = ["auth", "me"] as const;
/** Set while signed in, so a later 401 can be shown as "session expired". */
export const SESSION_FLAG = "ll_had_session";

async function fetchMe(): Promise<User | null> {
  try {
    return await api<User>("/api/auth/me");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export function useMe() {
  return useQuery({ queryKey: ME_KEY, queryFn: fetchMe, staleTime: 60_000, retry: false });
}

function useSignedIn() {
  const qc = useQueryClient();
  return (user: User) => {
    localStorage.setItem(SESSION_FLAG, "1");
    qc.setQueryData(ME_KEY, user);
  };
}

export function useLogin() {
  const onSignedIn = useSignedIn();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api<User>("/api/auth/login", { method: "POST", json: body }),
    onSuccess: onSignedIn,
  });
}

export function useRegister() {
  const onSignedIn = useSignedIn();
  return useMutation({
    mutationFn: (body: RegisterInput) => api<User>("/api/auth/register", { method: "POST", json: body }),
    onSuccess: onSignedIn,
  });
}

export function useAcceptInvitation() {
  const onSignedIn = useSignedIn();
  return useMutation({
    mutationFn: (body: Omit<RegisterInput, "email" | "organisation"> & { token: string }) =>
      api<User>("/api/invitations/accept", { method: "POST", json: body }),
    onSuccess: onSignedIn,
  });
}

export function useInvitationPreview(token: string) {
  return useQuery({
    queryKey: ["invitation", token],
    queryFn: () => api<InvitationPreview>("/api/invitations/inspect", { method: "POST", json: { token } }),
    enabled: token.length > 0,
    retry: false,
  });
}

export function useCreateInvitation() {
  return useMutation({
    mutationFn: (body: { email: string; role: Exclude<Role, "pharmacist"> }) =>
      api<InvitationCreated>("/api/invitations", { method: "POST", json: body }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { organisation: string | null; onboarded: boolean }) =>
      api<User>("/api/auth/me", { method: "PATCH", json: body }),
    onSuccess: (user) => qc.setQueryData(ME_KEY, user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>("/api/auth/logout", { method: "POST" }),
    onSettled: () => {
      localStorage.removeItem(SESSION_FLAG);
      qc.setQueryData(ME_KEY, null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
    },
  });
}

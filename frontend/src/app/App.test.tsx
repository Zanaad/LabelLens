import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../api/auth";
import { App } from "./App";

const pharmacist: User = { id: "1", email: "arta@example.org", full_name: "Arta Krasniqi", organisation: null, role: "pharmacist", onboarded_at: null };
const expert: User = { ...pharmacist, id: "2", email: "besim@example.org", full_name: "Besim Hoxha", role: "expert" };

// Generated per run so no password literal is ever committed.
const PASSWORD = crypto.randomUUID();

type Reply = { status: number; body?: unknown } | undefined;

// Stubs fetch: `me` answers /api/auth/me unless `handler` replies first.
function mockApi(me: User | null, handler?: (url: string) => Reply) {
  const fn = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => {
    const res = handler?.(url) ?? (url === "/api/auth/me" && me ? { status: 200, body: me } : { status: 401 });
    return new Response(JSON.stringify(res.body ?? {}), { status: res.status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function renderApp(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function sentBody(fetchMock: ReturnType<typeof mockApi>, url: string) {
  const call = fetchMock.mock.calls.find(([u]) => u === url)!;
  return JSON.parse(call[1]!.body as string);
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("routing and auth", () => {
  it("sends signed-out visitors to sign in", async () => {
    mockApi(null);
    renderApp("/scan");
    expect(await screen.findByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
  });

  it("shows the pharmacist nav and disclaimer", async () => {
    mockApi(pharmacist);
    renderApp("/scan");
    const nav = await screen.findByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Scan", "My scans", "Reference table", "Validation", "Methods and limitations",
    ]);
    expect(screen.getAllByText("Research prediction, not medical advice").length).toBeGreaterThan(0);
  });

  it("blocks pharmacists from admin pages", async () => {
    mockApi(pharmacist);
    renderApp("/admin");
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
  });

  it("signs in and goes to the role's start page", async () => {
    let signedIn = false;
    const fetchMock = mockApi(null, (url) => {
      if (url === "/api/auth/login") {
        signedIn = true;
        return { status: 200, body: expert };
      }
      if (url === "/api/auth/me" && signedIn) return { status: 200, body: expert };
    });
    renderApp("/sign-in");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Email"), "besim@example.org");
    await user.type(screen.getByLabelText("Password"), PASSWORD);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { name: "Review queue" })).toBeInTheDocument();
    expect(sentBody(fetchMock, "/api/auth/login")).toEqual({ email: "besim@example.org", password: PASSWORD });
  });

  it("registers with both consents", async () => {
    const fetchMock = mockApi(null, (url) => (url === "/api/auth/register" ? { status: 201, body: pharmacist } : undefined));
    renderApp("/register");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Full name"), "Arta Krasniqi");
    await user.type(screen.getByLabelText("Work email"), "arta@example.org");
    await user.type(screen.getByLabelText("Password"), PASSWORD);
    for (const box of screen.getAllByRole("checkbox")) await user.click(box);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => u === "/api/auth/register")).toBe(true));
    expect(sentBody(fetchMock, "/api/auth/register")).toMatchObject({ accept_privacy: true, accept_terms: true });
  });

  it("reads the invitation token from the URL fragment", async () => {
    const fetchMock = mockApi(null, (url) =>
      url === "/api/invitations/inspect"
        ? { status: 200, body: { email: "besim@example.org", role: "expert", expires_at: "2026-11-08T00:00:00Z" } }
        : undefined,
    );
    const token = crypto.randomUUID();
    renderApp(`/accept-invite#${token}`);
    expect(await screen.findByText(/You were invited as Expert reviewer/)).toBeInTheDocument();
    expect(sentBody(fetchMock, "/api/invitations/inspect")).toEqual({ token });
  });
});

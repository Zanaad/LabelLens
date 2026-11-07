import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../api/auth";
import { FIELD_KEYS } from "../api/scans";
import { App } from "./App";

const NOW = new Date().toISOString();

const pharmacist: User = { id: "1", email: "arta@example.org", full_name: "Arta Krasniqi", organisation: null, role: "pharmacist", onboarded_at: null };
const expert: User = { ...pharmacist, id: "2", email: "besim@example.org", full_name: "Besim Hoxha", role: "expert" };

// Generated per run so no password or token literal is ever committed.
const PASSWORD = crypto.randomUUID();
const SHARE_TOKEN = crypto.randomUUID();

type Reply = { status: number; body?: unknown } | undefined;

// Stubs fetch: `me` answers /api/auth/me unless `handler` replies first.
function mockApi(me: User | null, handler?: (url: string) => Reply) {
  const fn = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => {
    const res = handler?.(url) ?? (url === "/api/auth/me" && me ? { status: 200, body: me } : { status: 401 });
    const body = res.status === 204 ? null : JSON.stringify(res.body ?? {}); // 204 must not have a body
    return new Response(body, { status: res.status, headers: { "Content-Type": "application/json" } });
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
  const call = fetchMock.mock.calls.find(([u, init]) => u === url && init?.body)!; // skips GETs
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
    expect(await screen.findByText("This page isn't available for your role")).toBeInTheDocument();
    expect(screen.getByText("You're signed in as Arta Krasniqi, Pharmacist.")).toBeInTheDocument();
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
    expect(sentBody(fetchMock, "/api/auth/login")).toEqual({ email: "besim@example.org", password: PASSWORD, remember_me: false });
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

const stated = (value: string) => ({ value, status: "stated", confidence: 0.95, evidence: value, edited: false });
const notStated = { value: null, status: "not_stated", confidence: 1, evidence: null, edited: false };
const scan = {
  id: "s1",
  status: "extracted",
  created_at: "2026-11-03T10:00:00Z",
  original_filename: null,
  has_image: false,
  label_text: "MEADOW CUP\nChamomile tea",
  product_name: "MEADOW CUP",
  fields: {
    plant: stated("chamomile"),
    plant_part: stated("flowers"),
    preparation_type: stated("tea"),
    extract_ratio: notStated,
    solvent: notStated,
    marker: notStated,
    dose: stated("1.5 g"),
    other_ingredients: notStated,
    batch: notStated,
    expiry: stated("08/2027"),
  },
};

describe("scan and review", () => {
  it("reads an example label and links to its review", async () => {
    const fetchMock = mockApi(pharmacist, (url) => (url === "/api/scans/text" ? { status: 201, body: scan } : undefined));
    renderApp("/scan");
    const user = userEvent.setup();
    const example = await screen.findByRole("button", { name: /Chamomile tea/ });
    await user.click(example);
    expect(await screen.findByText("Label read. 5 of 10 fields found, 5 not stated on the label.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Review extracted fields/ })).toHaveAttribute("href", "/scans/s1/review");
    expect(sentBody(fetchMock, "/api/scans/text").text).toContain("MEADOW CUP");
  });

  it("sends only changed fields, then checks the evidence and shows the result", async () => {
    const fetchMock = mockApi(pharmacist, (url) =>
      url === "/api/scans/s1" || url === "/api/scans/s1/fields"
        ? { status: 200, body: scan }
        : url === "/api/scans/s1/verdict"
          ? { status: 201, body: verdict }
          : undefined,
    );
    renderApp("/scans/s1/review");
    const user = userEvent.setup();
    await screen.findByText("Extract ratio (DER)");
    await user.click(screen.getAllByRole("button", { name: "Add value from leaflet" })[0]!);
    await user.type(screen.getByLabelText("Extract ratio (DER)"), "4-7:1");
    await user.click(screen.getByRole("button", { name: /Check evidence/ }));
    expect(await screen.findByRole("heading", { level: 2, name: "Partly matches" })).toBeInTheDocument();
    expect(sentBody(fetchMock, "/api/scans/s1/fields")).toEqual({ fields: { extract_ratio: "4-7:1" } });
  });
});

const verdict = {
  id: "v1",
  created_at: "2026-11-03T10:01:00Z",
  rules_version: "0.1.0",
  verdict: "partly_matches",
  plant_latin: ["Chamaemelum nobile (L.) All.", "Matricaria recutita L."],
  reasons: [
    { code: "plant_ambiguous", params: { plant: "chamomile", options: ["Chamaemelum nobile (L.) All.", "Matricaria recutita L."] }, source: null, ask: null },
    { code: "partly", params: { prep: "Herbal tea" }, source: "r1", ask: null },
  ],
  comparisons: [
    {
      reference_id: "r1",
      name: "Herbal tea",
      evidence_level: "Traditional use",
      rows: [{ field: "plant", label: "chamomile", reference: "Matricaria recutita L.", status: "partial" }],
    },
  ],
  missing: [{ code: "species", params: { plant: "chamomile", options: ["A", "B"] }, source: null, ask: "manufacturer" }],
  sources: [
    { id: "r1", herb_latin: "Matricaria recutita L.", evidence_level: null, source_doc: "EU monograph", source_section: null, source_url: null, verified: false },
  ],
};

describe("result", () => {
  it("words the verdict, reasons and questions and flags sample data", async () => {
    mockApi(pharmacist, (url) =>
      url === "/api/scans/s1" ? { status: 200, body: scan } : url === "/api/scans/s1/verdict" ? { status: 200, body: verdict } : undefined,
    );
    renderApp("/scans/s1/result");
    expect(await screen.findByRole("heading", { level: 2, name: "Partly matches" })).toBeInTheDocument();
    expect(screen.getByText(/can mean more than one species \(Chamaemelum nobile \(L\.\) All\. or Matricaria/)).toBeInTheDocument();
    expect(screen.getByText(/Which species is this: A or B\?/)).toBeInTheDocument();
    expect(screen.getByText(/Sample reference data/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Open source 1" }));
    expect(within(screen.getByRole("dialog", { name: "Sources" })).getByText("EU monograph")).toBeInTheDocument();
  });

  it("goes back to the review when the scan has not been checked", async () => {
    mockApi(pharmacist, (url) =>
      url === "/api/scans/s1" ? { status: 200, body: scan } : url === "/api/scans/s1/verdict" ? { status: 404, body: { detail: "no_verdict" } } : undefined,
    );
    renderApp("/scans/s1/result");
    expect(await screen.findByRole("heading", { level: 1, name: "Review extracted fields" })).toBeInTheDocument();
  });
});

describe("compare", () => {
  it("lists only the fields that differ between two checked scans", async () => {
    const other = { ...scan, id: "s2", product_name: "CAMOMILE PLUS", fields: { ...scan.fields, solvent: stated("ethanol 60%") } };
    const item = { created_at: NOW, status: "checked", missing: 1, verdict: "partly_matches" };
    mockApi(pharmacist, (url) =>
      url === "/api/scans"
        ? { status: 200, body: [{ ...item, id: "s1", product_name: "MEADOW CUP", plant: "chamomile" }, { ...item, id: "s2", product_name: "CAMOMILE PLUS", plant: "chamomile" }] }
        : url === "/api/scans/s1" || url === "/api/scans/s2"
          ? { status: 200, body: url.endsWith("s1") ? scan : other }
          : url.endsWith("/verdict")
            ? { status: 200, body: verdict }
            : undefined,
    );
    renderApp("/compare?a=s1&b=s2");
    expect(await screen.findAllByText("Differs")).toHaveLength(1);
    expect(screen.getAllByText("Same")).toHaveLength(5);
    expect(screen.getAllByText("Neither states it")).toHaveLength(4);
  });
});

describe("history and sharing", () => {
  const now = new Date().toISOString();
  const row = { created_at: now, status: "checked", missing: 0 };
  const list = [
    { ...row, id: "a1", product_name: "MEADOW CUP", plant: "chamomile", verdict: "partly_matches", missing: 2 },
    { ...row, id: "b2", product_name: "GINKGOVITA 120", plant: "Ginkgo biloba", verdict: "matches" },
  ];

  it("filters my scans by verdict", async () => {
    mockApi(pharmacist, (url) => (url === "/api/scans" ? { status: 200, body: list } : undefined));
    renderApp("/scans");
    expect(await screen.findByText("2 of 2 scans shown")).toBeInTheDocument();
    await userEvent.setup().selectOptions(screen.getByLabelText("Verdict"), "matches");
    expect(screen.getByText("1 of 2 scans shown")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "MEADOW CUP" })).not.toBeInTheDocument();
  });

  it("saves corrections on the scan detail page and checks again", async () => {
    const fetchMock = mockApi(pharmacist, (url) =>
      url === "/api/scans/s1" || url === "/api/scans/s1/fields"
        ? { status: 200, body: scan }
        : url === "/api/scans/s1/verdict"
          ? { status: 200, body: verdict }
          : url === "/api/scans/s1/history"
            ? { status: 200, body: { corrections: [], activity: [], shares: [] } }
            : undefined,
    );
    renderApp("/scans/s1");
    const user = userEvent.setup();
    const plant = await screen.findByLabelText("Plant");
    await user.clear(plant);
    await user.type(plant, "German chamomile");
    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save and re-check" }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u, init]) => u === "/api/scans/s1/verdict" && init?.method === "POST")).toBe(true),
    );
    expect(sentBody(fetchMock, "/api/scans/s1/fields")).toEqual({ fields: { plant: "German chamomile" } });
  });

  it("shows a shared result in plain language without signing in", async () => {
    const shared = {
      product_name: "MEADOW CUP",
      plant: "chamomile",
      verdict: "partly_matches",
      shared_by: "Arta Krasniqi",
      organisation: "City Pharmacy",
      shared_at: now,
      expires_at: now,
    };
    const fetchMock = mockApi(null, (url) => (url === "/api/shared" ? { status: 200, body: shared } : undefined));
    renderApp(`/p#${SHARE_TOKEN}`);
    const head = "The label partly matches the kind of chamomile preparation that was studied.";
    expect(await screen.findByRole("heading", { level: 2, name: head })).toBeInTheDocument();
    expect(screen.getByText(/Arta Krasniqi, City Pharmacy/)).toBeInTheDocument();
    expect(sentBody(fetchMock, "/api/shared")).toEqual({ token: SHARE_TOKEN });
  });

  it("explains an expired or revoked patient link", async () => {
    mockApi(null, (url) => (url === "/api/shared" ? { status: 404, body: { detail: "share_invalid" } } : undefined));
    renderApp(`/p#${SHARE_TOKEN}`);
    expect(await screen.findByRole("heading", { name: "This link is not valid" })).toBeInTheDocument();
  });
});

describe("password reset", () => {
  it("asks for a link without saying whether the account exists", async () => {
    const fetchMock = mockApi(null, (url) => (url === "/api/auth/forgot-password" ? { status: 202 } : undefined));
    renderApp("/forgot-password");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Email"), "arta@example.org");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByText(/If an account exists for arta@example.org/)).toBeInTheDocument();
    expect(sentBody(fetchMock, "/api/auth/forgot-password")).toEqual({ email: "arta@example.org" });
  });

  it("sets a new password from the link and returns to sign in", async () => {
    const fetchMock = mockApi(null, (url) => (url === "/api/auth/reset-password" ? { status: 204 } : undefined));
    renderApp(`/reset-password#${SHARE_TOKEN}`);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("New password"), PASSWORD);
    await user.type(screen.getByLabelText("Repeat the new password"), `${PASSWORD}x`);
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(screen.getByText("The two passwords are not the same.")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Repeat the new password"));
    await user.type(screen.getByLabelText("Repeat the new password"), PASSWORD);
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByText(/Your password was changed/)).toBeInTheDocument();
    expect(sentBody(fetchMock, "/api/auth/reset-password")).toEqual({ token: SHARE_TOKEN, password: PASSWORD });
  });

  it("changes the password in settings and confirms it on the sign-in page", async () => {
    const fetchMock = mockApi({ ...pharmacist, onboarded_at: NOW }, (url) =>
      url === "/api/auth/change-password" ? { status: 204 } : undefined,
    );
    renderApp("/settings");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Current password"), `${PASSWORD}old`);
    await user.type(screen.getByLabelText("New password"), PASSWORD);
    await user.type(screen.getByLabelText("Repeat the new password"), PASSWORD);
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText(/Your password was changed/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    expect(sentBody(fetchMock, "/api/auth/change-password")).toEqual({
      current_password: `${PASSWORD}old`,
      new_password: PASSWORD,
    });
  });
});

describe("expert and admin", () => {
  const admin: User = { ...pharmacist, id: "3", email: "admin@example.org", full_name: "Dita Admin", role: "admin" };
  const review = { verdict, product_name: "MEADOW CUP", label_text: "MEADOW CUP", has_image: false, fields: scan.fields, my_rating: null };

  it("asks the expert for the right verdict when they disagree", async () => {
    const fetchMock = mockApi(expert, (url) =>
      url === "/api/reviews/v1" ? { status: 200, body: review } : url === "/api/reviews" ? { status: 200, body: [] } : undefined,
    );
    renderApp("/review/v1");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("radio", { name: "Disagree" }));
    const choose = screen.getByLabelText("What should the verdict be?");
    expect(within(choose).queryByRole("option", { name: "Partly matches" })).not.toBeInTheDocument(); // the app's own verdict
    await user.selectOptions(choose, "matches");
    await user.click(screen.getByRole("button", { name: "Save review" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u, init]) => u === "/api/reviews/v1" && init?.method === "PUT")).toBe(true));
    expect(sentBody(fetchMock, "/api/reviews/v1")).toEqual({ rating: "disagree", correct_verdict: "matches", reason: null });
  });

  it("lets only admins edit the reference table", async () => {
    const reference = {
      preparations: [
        {
          id: "p1",
          herb_latin: "Matricaria recutita L.",
          plant_part: "Flower",
          preparation_type: "Herbal tea",
          extract_ratio_min: null,
          extract_ratio_max: null,
          solvent_type: null,
          solvent_strength: null,
          evidence_level: "Traditional use",
          source_doc: null,
          source_section: null,
          source_url: null,
          verified: false,
          notes: "TODO(expert): check",
          updated_at: NOW,
        },
      ],
      plant_names: [],
    };
    mockApi(expert, (url) => (url === "/api/reference" ? { status: 200, body: reference } : undefined));
    renderApp("/reference");
    expect(await screen.findByText("Matricaria recutita L.")).toBeInTheDocument();
    expect(screen.getByText("Sample, not checked")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Herbal tea" })).not.toBeInTheDocument();
    cleanup();
    mockApi(admin, (url) => (url === "/api/reference" ? { status: 200, body: reference } : undefined));
    renderApp("/reference");
    expect(await screen.findByRole("button", { name: "Edit Herbal tea" })).toBeInTheDocument();
  });

  it("shows validation numbers with their uncertainty and a table view", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    const rate = (correct: number, total: number) => ({ correct, total, accuracy: correct / total, ci: [0.2, 0.9], confusion: {} });
    const field = { ...rate(4, 5), wrong: 0, missed: 1, invented: 0 };
    const metrics = {
      versions: { rules: "0.1.0", prompt: "p1", plain_prompt: "pp1", model: "m" },
      dataset: { labels: 5, with_expected_verdict: 5, read: 5, not_read: [], include_drafts: false },
      fields: Object.fromEntries(FIELD_KEYS.map((k) => [k, field])),
      verdicts: { rules_only: rate(4, 5), end_to_end: rate(3, 5) },
      baselines: { keyword: rate(1, 5), plain_model: { ...rate(2, 5), fields: {} } },
      expert_ratings: { ...rate(0, 0), accuracy: null, ci: null, agree: 0, disagree: 0, unsure: 0 },
      failures: [],
    };
    const run = { id: "r1", created_at: NOW, rules_version: "0.1.0", prompt_version: "p1", dataset_size: 5, include_drafts: false, end_to_end: 0.6, rules_only: 0.8 };
    mockApi(pharmacist, (url) =>
      url === "/api/validation/runs"
        ? { status: 200, body: [run] }
        : url === "/api/validation/runs/r1"
          ? { status: 200, body: { ...run, started_by: "Dita Admin", metrics } }
          : undefined,
    );
    renderApp("/validation");
    expect(await screen.findByText("Only 5 labels have an expected verdict", { exact: false })).toBeInTheDocument();
    const methods = screen.getByRole("region", { name: "LabelLens compared with simpler approaches" });
    expect(within(methods).getByRole("rowheader", { name: "Keyword match (herb named means evidence applies)" })).toBeInTheDocument();
    expect(within(methods).getAllByText("20% · 1 of 5").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Run validation" })).not.toBeInTheDocument(); // admins only
  });
});

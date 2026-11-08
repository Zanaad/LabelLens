import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { t } from "../i18n";
import { AboutPage } from "../pages/AboutPage";
import { AcceptInvitePage } from "../pages/AcceptInvitePage";
import { AdminPage } from "../pages/AdminPage";
import { LabelEditorPage, LabelsPage } from "../pages/AnnotationsPage";
import { ReviewDetailPage, ReviewQueuePage } from "../pages/ExpertReviewPage";
import { ComparePage } from "../pages/ComparePage";
import { ForgotPasswordPage } from "../pages/ForgotPasswordPage";
import { MethodsPage } from "../pages/MethodsPage";
import { MyScansPage } from "../pages/MyScansPage";
import { OnboardingPage } from "../pages/OnboardingPage";
import { PatientPage } from "../pages/PatientPage";
import { ReferencePage } from "../pages/ReferencePage";
import { RegisterPage } from "../pages/RegisterPage";
import { ResetPasswordPage } from "../pages/ResetPasswordPage";
import { ResultPage } from "../pages/ResultPage";
import { ReviewPage } from "../pages/ReviewPage";
import { ScanDetailPage } from "../pages/ScanDetailPage";
import { ScanPage } from "../pages/ScanPage";
import { SettingsPage } from "../pages/SettingsPage";
import { SignInPage } from "../pages/SignInPage";
import { SummaryPage } from "../pages/SummaryPage";
import { VerifyEmailPage } from "../pages/VerifyEmailPage";
import { NotFoundPage } from "../pages/StatusPages";
import { HomeRedirect, RedirectIfSignedIn, RequireAuth, RequireRole } from "./guards";

// Loaded on demand: the chart library is only needed on this page.
const ValidationPage = lazy(() => import("../pages/ValidationPage").then((m) => ({ default: m.ValidationPage })));

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />

      {/* Public */}
      <Route path="/sign-in" element={<RedirectIfSignedIn><SignInPage /></RedirectIfSignedIn>} />
      <Route path="/register" element={<RedirectIfSignedIn><RegisterPage /></RedirectIfSignedIn>} />
      <Route path="/accept-invite" element={<RedirectIfSignedIn><AcceptInvitePage /></RedirectIfSignedIn>} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/p" element={<PatientPage />} />

      {/* Signed in */}
      <Route element={<RequireAuth />}>
        <Route element={<RequireRole roles={["pharmacist"]} />}>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/scans" element={<MyScansPage />} />
          <Route path="/scans/:id" element={<ScanDetailPage />} />
          <Route path="/scans/:id/review" element={<ReviewPage />} />
          <Route path="/scans/:id/result" element={<ResultPage />} />
          <Route path="/scans/:id/summary" element={<SummaryPage />} />
          <Route path="/compare" element={<ComparePage />} />
        </Route>
        <Route element={<RequireRole roles={["expert"]} />}>
          <Route path="/review" element={<ReviewQueuePage />} />
          <Route path="/review/:id" element={<ReviewDetailPage />} />
        </Route>
        <Route element={<RequireRole roles={["expert", "admin"]} />}>
          <Route path="/validation/labels" element={<LabelsPage />} />
          <Route path="/validation/labels/:id" element={<LabelEditorPage />} />
        </Route>
        <Route element={<RequireRole roles={["admin"]} />}>
          <Route path="/admin" element={<AdminPage />} />
        </Route>
        <Route path="/reference" element={<ReferencePage />} />
        <Route
          path="/validation"
          element={
            <Suspense fallback={<p role="status" className="text-muted">{t("app.loading")}</p>}>
              <ValidationPage />
            </Suspense>
          }
        />
        <Route path="/methods" element={<MethodsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

import { Route, Routes } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { AcceptInvitePage } from "../pages/AcceptInvitePage";
import { AdminPage } from "../pages/AdminPage";
import { ForgotPasswordPage } from "../pages/ForgotPasswordPage";
import { MyScansPage } from "../pages/MyScansPage";
import { OnboardingPage } from "../pages/OnboardingPage";
import { PatientPage } from "../pages/PatientPage";
import { RegisterPage } from "../pages/RegisterPage";
import { ResultPage } from "../pages/ResultPage";
import { ReviewPage } from "../pages/ReviewPage";
import { ScanDetailPage } from "../pages/ScanDetailPage";
import { ScanPage } from "../pages/ScanPage";
import { SignInPage } from "../pages/SignInPage";
import { SummaryPage } from "../pages/SummaryPage";
import { NotFoundPage, PlaceholderPage } from "../pages/StatusPages";
import { HomeRedirect, RedirectIfSignedIn, RequireAuth, RequireRole } from "./guards";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />

      {/* Public */}
      <Route path="/sign-in" element={<RedirectIfSignedIn><SignInPage /></RedirectIfSignedIn>} />
      <Route path="/register" element={<RedirectIfSignedIn><RegisterPage /></RedirectIfSignedIn>} />
      <Route path="/accept-invite" element={<RedirectIfSignedIn><AcceptInvitePage /></RedirectIfSignedIn>} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/about" element={<AuthLayout><PlaceholderPage title="footer.about" /></AuthLayout>} />
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
        </Route>
        <Route element={<RequireRole roles={["expert", "admin"]} />}>
          <Route path="/review" element={<PlaceholderPage title="nav.reviewQueue" />} />
        </Route>
        <Route element={<RequireRole roles={["admin"]} />}>
          <Route path="/admin" element={<AdminPage />} />
        </Route>
        <Route path="/reference" element={<PlaceholderPage title="nav.reference" />} />
        <Route path="/validation" element={<PlaceholderPage title="nav.validation" />} />
        <Route path="/methods" element={<PlaceholderPage title="nav.methods" />} />
        <Route path="/settings" element={<PlaceholderPage title="account.settings" />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

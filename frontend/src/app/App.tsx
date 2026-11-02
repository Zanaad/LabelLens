import { Route, Routes } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { AcceptInvitePage } from "../pages/AcceptInvitePage";
import { AdminPage } from "../pages/AdminPage";
import { ForgotPasswordPage } from "../pages/ForgotPasswordPage";
import { RegisterPage } from "../pages/RegisterPage";
import { SignInPage } from "../pages/SignInPage";
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

      {/* Signed in */}
      <Route element={<RequireAuth />}>
        <Route element={<RequireRole roles={["pharmacist"]} />}>
          <Route path="/scan" element={<PlaceholderPage title="nav.scan" />} />
          <Route path="/scans" element={<PlaceholderPage title="nav.myScans" />} />
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

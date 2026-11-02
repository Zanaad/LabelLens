// English UI strings. Wording rules (enforced by i18n.test.ts):
// never use the word "safe"; always show the disclaimer and the label-only note.
export const en = {
  "app.name": "LabelLens",
  "app.home": "LabelLens home",
  "app.disclaimer": "Research prediction, not medical advice",
  "app.labelOnly": "This checks the label, not what is inside the product",
  "app.privacyNote":
    "We store scanned product labels and results for your history. Do not upload patient names or personal data.",
  "app.loading": "Loading…",

  "theme.toLight": "Switch to light theme",
  "theme.toDark": "Switch to dark theme",

  "nav.main": "Main",
  "nav.menu": "Menu",
  "nav.scan": "Scan",
  "nav.myScans": "My scans",
  "nav.reviewQueue": "Review queue",
  "nav.admin": "Admin",
  "nav.reference": "Reference table",
  "nav.validation": "Validation",
  "nav.methods": "Methods and limitations",

  "account.menuFor": "Account menu for {name}",
  "account.signedInAs": "Signed in as",
  "account.settings": "Settings",
  "account.signOut": "Sign out",

  "role.pharmacist": "Pharmacist",
  "role.expert": "Expert reviewer",
  "role.admin": "Admin",

  "footer.sourcesTitle": "Data sources",
  "footer.sourcesBody":
    "EU herbal monographs (EMA, Committee on Herbal Medicinal Products). Published product-quality reviews. LabelLens reference table (sample, not yet verified).",
  "footer.about": "About LabelLens",
  "footer.licencesTitle": "Licences",
  "footer.licencesBody":
    "Monograph content reused under EMA terms (to be verified). Code: MIT licence.",
  "footer.privacyTitle": "Privacy",
  "footer.disclaimerTitle": "Disclaimer",
  "footer.disclaimerBody":
    "Research prediction, not medical advice. This checks the label, not what is inside the product. EthnoHack 2026, Track 4.",

  "authAside.eyebrow": "For pharmacists",
  "authAside.heading": "Does the evidence for this herb apply to this product?",
  "authAside.step1": "Read the label",
  "authAside.step2": "Compare with preparations studied in EU herbal monographs",
  "authAside.step3": "See what the label leaves out",

  "form.optional": "(optional)",
  "form.showPassword": "Show password",
  "form.hidePassword": "Hide password",
  "form.emailPlaceholder": "name@pharmacy.org",
  "form.passwordHint": "At least 12 characters. A passphrase of a few words works well.",
  "form.submitting": "Please wait…",

  "register.title": "Create a pharmacist account",
  "register.intro":
    "Registration creates a Pharmacist account. Expert reviewer and Admin accounts are created by invitation.",
  "register.fullName": "Full name",
  "register.workEmail": "Work email",
  "register.password": "Password",
  "register.organisation": "Pharmacy or workplace",
  "register.consentPrivacy":
    "I will not upload patient names or other personal data. Scanned labels and results are stored for my history.",
  "register.consentTermsBefore":
    "I understand results are research predictions, not medical advice, and accept the ",
  "register.consentTermsLink": "terms of use",
  "register.consentTermsAfter": ".",
  "register.submit": "Create account",
  "register.haveAccount": "Already have an account?",
  "register.signIn": "Sign in",

  "signIn.title": "Sign in",
  "signIn.intro": "Welcome back. Your scans and results are in your history.",
  "signIn.expired": "Your session expired. Sign in again to continue where you left off.",
  "signIn.email": "Email",
  "signIn.password": "Password",
  "signIn.forgot": "Forgot password?",
  "signIn.submit": "Sign in",
  "signIn.newHere": "New to LabelLens?",
  "signIn.createAccount": "Create a pharmacist account",
  "signIn.invited": "Invited as an expert reviewer or admin?",
  "signIn.acceptInvite": "Accept your invitation",

  "invite.title": "Accept your invitation",
  "invite.intro": "You were invited as {role}. Choose your name and a password to finish.",
  "invite.email": "Email",
  "invite.checking": "Checking your invitation…",
  "invite.missing":
    "Open the invitation link you received. If it does not work, ask your LabelLens admin for a new one.",
  "invite.submit": "Create account",

  "forgot.title": "Forgot password?",
  "forgot.body":
    "Password reset by email is not available yet. Ask your LabelLens admin to reset your password.",
  "forgot.back": "Back to sign in",

  "admin.title": "Admin",
  "admin.inviteTitle": "Invite an expert reviewer or admin",
  "admin.inviteIntro":
    "No email is sent. Copy the link and send it to the person yourself. It works once and expires.",
  "admin.inviteEmail": "Email",
  "admin.inviteRole": "Role",
  "admin.inviteSubmit": "Create invitation",
  "admin.inviteCreated": "Invitation for {email} created. Expires {date}.",
  "admin.inviteLink": "Invitation link",
  "admin.copy": "Copy link",
  "admin.copied": "Link copied",

  "placeholder.body": "This screen is not built yet.",
  "forbidden.title": "You don't have access to this page",
  "forbidden.body": "Your role does not include this page. Use the menu to go to your pages.",
  "notFound.title": "Page not found",
  "notFound.back": "Go to your start page",

  "error.invalid_credentials": "Email or password is not correct.",
  "error.email_taken": "An account with this email already exists. Sign in instead.",
  "error.password_too_short": "Use at least 12 characters for your password.",
  "error.consent_required": "Please tick both boxes to continue.",
  "error.invitation_invalid":
    "This invitation link is not valid. It may have expired or been used already. Ask your admin for a new one.",
  "error.too_many_requests": "Too many attempts. Wait a minute and try again.",
  "error.forbidden": "You don't have permission to do this.",
  "error.network": "Could not reach LabelLens. Check your connection and try again.",
  "error.generic": "Something went wrong. Please try again.",
} as const;

export type MessageKey = keyof typeof en;

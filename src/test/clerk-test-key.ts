// A syntactically valid but unusable Clerk publishable key for tests. Now that ClerkProvider
// is mounted globally (src/main.tsx), any component tree that reaches AccountMenu or the portal
// identity provider calls Clerk hooks, which throw without a <ClerkProvider> ancestor. Clerk
// never finishes loading against this key in a test environment (no real Clerk instance), so
// tests using it exercise the signed-out / no-match fallback path, same as before Clerk existed.
export const TEST_CLERK_PUBLISHABLE_KEY = "pk_test_dGVzdC5jbGVyay5hY2NvdW50cy5kZXYk"; // gitleaks:allow — fake, not a real credential

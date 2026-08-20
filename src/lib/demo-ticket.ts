export async function consumeDemoTicket(
  signOut: (options: { redirectUrl: string }) => Promise<unknown>,
  signInUrl: string,
  isSignedIn: boolean,
  navigate: (url: string) => void = (url) => window.location.assign(url),
) {
  // An active role must be signed out before Clerk consumes the next role ticket. When
  // there is no active session, signOut has no redirect to complete, so navigate exactly
  // once instead. A ticket is single-use; never execute both branches.
  if (isSignedIn) await signOut({ redirectUrl: signInUrl });
  else navigate(signInUrl);
}

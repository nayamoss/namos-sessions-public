export async function consumeDemoTicket(
  signOut: (options: { redirectUrl: string }) => Promise<unknown>,
  signInUrl: string,
) {
  // Clerk redirects from signOut by default. Supplying the one-time ticket as that
  // redirect makes the handoff atomic; code after signOut is not guaranteed to run.
  await signOut({ redirectUrl: signInUrl });
  window.location.assign(signInUrl);
}

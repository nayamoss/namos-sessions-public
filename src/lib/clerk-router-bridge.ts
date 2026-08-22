// ClerkProvider lives in main.tsx, outside App's own <BrowserRouter> (App owns its Router so it
// stays self-contained for tests — see the comment above <BrowserRouter> in App.tsx). That means
// ClerkProvider can't call useNavigate() directly for its routerPush/routerReplace props: there's
// no Router in scope at that call site.
//
// Without those props, Clerk falls back to a hard `window.location` navigation for its own
// internal routing (e.g. /sign-in -> /sign-in/factor-one, or bouncing back to /sign-in on error).
// That wipes the whole React app on every sign-in step — this was a real bug, not theoretical.
//
// ClerkRouterBridge (rendered once, inside App's BrowserRouter) stashes a real useNavigate()
// function here so ClerkProvider, one level up, can route through React Router instead.
let navigateImpl: ((to: string, opts?: { replace?: boolean }) => void) | null = null;

export function setRouterNavigate(fn: typeof navigateImpl) {
  navigateImpl = fn;
}

export function navigateViaRouter(to: string, opts?: { replace?: boolean }) {
  if (navigateImpl) {
    navigateImpl(to, opts);
    return;
  }
  // Fallback for the brief window before ClerkRouterBridge mounts, or if it's ever missing.
  if (opts?.replace) window.location.replace(to);
  else window.location.assign(to);
}

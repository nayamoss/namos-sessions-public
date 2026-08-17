export type TurnstileApi = {
  render(container: HTMLElement, options: {
    sitekey: string;
    action: string;
    theme: "auto";
    callback(token: string): void;
    "expired-callback"(): void;
    "error-callback"(): void;
  }): string;
  remove(widgetId: string): void;
  reset(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileScript: Promise<TurnstileApi> | undefined;

export function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileScript) return turnstileScript;
  const pending = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-namos-turnstile="true"]');
    const script = existing ?? document.createElement("script");
    const onLoad = () => window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile did not initialize."));
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", () => {
      if (!existing) script.remove();
      reject(new Error("Turnstile could not load."));
    }, { once: true });
    if (!existing) {
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.namosTurnstile = "true";
      document.head.append(script);
    }
  });
  turnstileScript = pending.catch((error) => {
    turnstileScript = undefined;
    throw error;
  });
  return turnstileScript;
}

export function preloadTurnstile() {
  return loadTurnstile();
}

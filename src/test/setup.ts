import "@testing-library/jest-dom";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom 29 dropped its built-in Storage implementation and defers to Node's experimental
// localStorage, which is inert unless the process is started with --localstorage-file. That
// leaves window.localStorage undefined, so any component reading a remembered preference throws
// "Cannot read properties of undefined (reading 'getItem')" instead of exercising its real logic.
// A plain in-memory Storage restores the browser behaviour the app actually ships against.
class MemoryStorage implements Storage {
  #entries = new Map<string, string>();
  get length() { return this.#entries.size; }
  clear() { this.#entries.clear(); }
  getItem(key: string) { return this.#entries.has(key) ? this.#entries.get(key)! : null; }
  key(index: number) { return [...this.#entries.keys()][index] ?? null; }
  removeItem(key: string) { this.#entries.delete(key); }
  setItem(key: string, value: string) { this.#entries.set(key, String(value)); }
}

for (const name of ["localStorage", "sessionStorage"] as const) {
  const storage = new MemoryStorage();
  // Defined on both: code reaches for the bare global and for window.* interchangeably, and a
  // value on only one of them fails whichever half of the codebase uses the other.
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: storage });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, name, { configurable: true, writable: true, value: storage });
  }
}

if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}

class ResizeObserverMock implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof window !== "undefined") {
  Object.defineProperty(window, "ResizeObserver", {
    writable: true,
    value: ResizeObserverMock,
  });
}
Object.defineProperty(globalThis, "ResizeObserver", {
  writable: true,
  value: ResizeObserverMock,
});

if (typeof Element !== "undefined") {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    writable: true,
    value: () => {},
  });
}

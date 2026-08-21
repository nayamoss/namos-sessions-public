import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { settingsPath, settingsTabFromPath, type SettingsTabId } from "./settings-nav";
import { SettingsModal } from "./SettingsModal";
import { useOptionalCurrentEvent } from "@/components/EventContext";

type SettingsModalContextValue = {
  openSettings: (tab: SettingsTabId) => void;
  closeSettings: () => void;
  // Lets the active settings panel (e.g. Event details' Rooms/Tracks editors) report
  // that it holds edits the Save button hasn't persisted yet. Nothing here autosaves —
  // Escape, an outside click, or switching tabs would otherwise discard those edits
  // with no warning at all.
  setHasUnsavedChanges: (value: boolean) => void;
};

const SettingsModalContext = createContext<SettingsModalContextValue | undefined>(undefined);

// AppLayout — which mounts this provider — is instantiated per-page (DashboardHome,
// EventsLanding, ...), so a component-local ref for "where to return on close" gets wiped
// the instant a settings tab lives outside the event-scoped route tree (e.g. Organization)
// and the underlying page swaps out AppLayout entirely. sessionStorage survives that remount;
// a plain ref does not.
const RETURN_PATH_KEY = "namos:settings-return-path";
// Same remount problem as RETURN_PATH_KEY, different symptom: useOptionalCurrentEvent() only
// resolves inside the event-scoped route tree, so eventSlug goes undefined the moment you're
// on the Organization tab. Without remembering the last real event slug, switching from
// Organization back to an Event-group tab falls through to a slug-less /settings/:tab URL,
// which LegacySettingsEntry resolves to the user's FIRST event — not the one they were just
// looking at. An organizer who opened settings for event B can land on event A's settings.
const LAST_EVENT_SLUG_KEY = "namos:settings-last-event-slug";

export function SettingsModalProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const liveEventSlug = useOptionalCurrentEvent()?.event.slug;
  const lastEventSlug = useRef<string>();
  if (liveEventSlug) {
    lastEventSlug.current = liveEventSlug;
    sessionStorage.setItem(LAST_EVENT_SLUG_KEY, liveEventSlug);
  }
  const eventSlug = liveEventSlug ?? lastEventSlug.current ?? sessionStorage.getItem(LAST_EVENT_SLUG_KEY) ?? undefined;
  const initialTab = settingsTabFromPath(location.pathname);
  const [tab, setTab] = useState<SettingsTabId>(initialTab ?? "event");
  const [open, setOpen] = useState(Boolean(initialTab));
  const returnPath = useRef<string>();
  const hasUnsavedChanges = useRef(false);
  const setHasUnsavedChanges = useCallback((value: boolean) => {
    hasUnsavedChanges.current = value;
  }, []);
  // True if the caller should stop (the user chose not to discard). Every path that can
  // make the modal disappear or swap panels — Escape, an outside click, the visible Save
  // dialog's own close button, and switching tabs — routes through here first.
  const confirmDiscardIfDirty = useCallback(() => {
    if (!hasUnsavedChanges.current) return true;
    const discard = window.confirm(
      "You have unsaved changes. Discard them?",
    );
    if (discard) hasUnsavedChanges.current = false;
    return discard;
  }, []);

  useEffect(() => {
    const nextTab = settingsTabFromPath(location.pathname);
    if (nextTab) {
      setTab(nextTab);
      setOpen(true);
    }
  }, [location.pathname]);

  const closeSettings = useCallback(() => {
    if (!confirmDiscardIfDirty()) return;
    setOpen(false);
    const stored = sessionStorage.getItem(RETURN_PATH_KEY) ?? undefined;
    const fallback = eventSlug ? `/events/${eventSlug}/dashboard` : "/events";
    navigate(returnPath.current ?? stored ?? fallback, { replace: true });
    returnPath.current = undefined;
    sessionStorage.removeItem(RETURN_PATH_KEY);
  }, [confirmDiscardIfDirty, eventSlug, navigate]);

  const openSettings = useCallback((nextTab: SettingsTabId) => {
    if (!open) {
      const path = `${location.pathname}${location.search}${location.hash}`;
      returnPath.current = path;
      sessionStorage.setItem(RETURN_PATH_KEY, path);
    }
    setTab(nextTab);
    setOpen(true);
    navigate(settingsPath(nextTab, eventSlug), { replace: true });
  }, [eventSlug, location.hash, location.pathname, location.search, navigate, open]);

  const changeTab = useCallback((nextTab: SettingsTabId) => {
    if (!confirmDiscardIfDirty()) return;
    setTab(nextTab);
    navigate(settingsPath(nextTab, eventSlug), { replace: true });
  }, [confirmDiscardIfDirty, eventSlug, navigate]);

  return (
    <SettingsModalContext.Provider value={{ openSettings, closeSettings, setHasUnsavedChanges }}>
      {children}
      <SettingsModal open={open} activeTab={tab} onOpenChange={(nextOpen) => nextOpen ? setOpen(true) : closeSettings()} onTabChange={changeTab} />
    </SettingsModalContext.Provider>
  );
}

export function useSettingsModal() {
  const context = useContext(SettingsModalContext);
  if (!context) throw new Error("useSettingsModal must be used inside SettingsModalProvider");
  return context;
}

export function useOptionalSettingsModal() {
  return useContext(SettingsModalContext);
}

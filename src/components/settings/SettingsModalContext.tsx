import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { SettingsModal } from "./SettingsModal";
import { useOptionalCurrentEvent } from "@/components/EventContext";

type SettingsModalContextValue = {
  openSettings: () => void;
  closeSettings: () => void;
  setHasUnsavedChanges: (value: boolean) => void;
};

const SettingsModalContext = createContext<SettingsModalContextValue | undefined>(undefined);

export function SettingsModalProvider({ children }: { children: ReactNode }) {
  const liveEventSlug = useOptionalCurrentEvent()?.event.slug;
  const routeEventSlug = useParams<{ eventSlug?: string }>().eventSlug;
  const [open, setOpen] = useState(false);
  const closeSettings = useCallback(() => setOpen(false), []);
  const openSettings = useCallback(() => setOpen(true), []);
  const setHasUnsavedChanges = useCallback((_value: boolean) => {}, []);
  return (
    <SettingsModalContext.Provider value={{ openSettings, closeSettings, setHasUnsavedChanges }}>
      {children}
      <SettingsModal open={open} eventSlug={liveEventSlug ?? routeEventSlug} onOpenChange={setOpen} />
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

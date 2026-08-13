import { createContext, useContext } from "react";
import type { ReactiveTransport, ReadOperation, ReadState } from "./transport";

export const ReactiveContext = createContext<ReactiveTransport | null>(null);

export function useRepoQuery<Result>(operation: ReadOperation, input: object | "skip"): ReadState<Result> {
  const transport = useContext(ReactiveContext);
  if (!transport) throw new Error("Reactive repository provider is missing");
  return transport.useRead<Result>(operation, input);
}

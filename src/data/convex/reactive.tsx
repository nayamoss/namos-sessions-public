import { useQuery } from "convex-helpers/react/cache";
import { makeFunctionReference } from "convex/server";
import type { ReactiveTransport, ReadOperation } from "../transport";
import { convexFunction, normalize, normalizeInput } from ".";

export function normalizeReactiveResult(operation: ReadOperation, value: unknown): unknown {
  return normalize(operation, value);
}

export function createConvexReactiveTransport(): ReactiveTransport {
  return {
    useRead<Result>(operation: ReadOperation, input: object | "skip") {
      const args = input === "skip"
        ? "skip"
        : normalizeInput(operation, input as Record<string, unknown>);
      const query = makeFunctionReference<"query", Record<string, unknown>, unknown>(convexFunction[operation]);
      const value = useQuery(query, args as never);

      return {
        data: value === undefined ? undefined : normalizeReactiveResult(operation, value) as Result,
        isLoading: input !== "skip" && value === undefined,
        error: undefined,
      };
    },
  };
}

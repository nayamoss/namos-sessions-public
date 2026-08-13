import { useQuery } from "@tanstack/react-query";
import type { DataTransport, ReactiveTransport, ReadOperation } from "../transport";

export function createAirtableReactiveTransport(transport: DataTransport): ReactiveTransport {
  return {
    useRead<Result>(operation: ReadOperation, input: object | "skip") {
      const query = useQuery<Result, Error>({
        queryKey: ["airtable", operation, input],
        queryFn: () => transport.read<Result>(operation, input === "skip" ? {} : input),
        enabled: input !== "skip",
        // Existing unsupported operations fail once with their existing guard message.
        // Retrying would turn one deterministic rejection into repeated proxy attempts.
        retry: false,
      });

      return {
        data: query.data as Result | undefined,
        isLoading: input !== "skip" && query.isPending,
        error: query.error ?? undefined,
      };
    },
  };
}

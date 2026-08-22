import type { UserIdentity } from "convex/server";
import type { MutationCtx } from "../../../convex/_generated/server";

// A minimal in-memory Convex ctx for exercising *mutations* end to end (insert/patch/delete, not
// just reads) in the #268 Phase 2 merge/reversal/import tests, which need real write behavior --
// unlike the read-only fakeCtx harnesses used for Phase 1's access-control tests. `.unique()`
// intentionally throws on more than one match, mirroring real Convex, so a test can prove code
// under test avoids ever calling `.unique()` on a query that can legitimately return two rows
// (e.g. crm_contacts.by_org_email once a merge exists).

export type Row = Record<string, unknown> & { _id: string };

export function makeFakeCtx(identity: UserIdentity | undefined, seedTables: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seedTables).map(([table, rows]) => [table, rows.map((row) => ({ ...row }))]),
  );
  let counter = 0;
  const byId = () => new Map<string, Row>(Object.values(tables).flat().map((row) => [row._id, row]));

  const db = {
    get: async (id: string | undefined) => (id ? (byId().get(id) ?? null) : null),
    insert: async (table: string, value: Record<string, unknown>) => {
      const _id = `${table}-gen-${++counter}`;
      const row = { _id, ...value } as Row;
      tables[table] = tables[table] ?? [];
      tables[table].push(row);
      return _id;
    },
    patch: async (id: string, value: Record<string, unknown>) => {
      const row = byId().get(id);
      if (!row) throw new Error(`patch: no row ${id}`);
      for (const [key, val] of Object.entries(value)) {
        if (val === undefined) delete row[key];
        else row[key] = val;
      }
    },
    delete: async (id: string) => {
      for (const table of Object.keys(tables)) tables[table] = tables[table].filter((row) => row._id !== id);
    },
    query: (table: string) => {
      const conditions: Array<[string, unknown]> = [];
      const rows = () => tables[table] ?? [];
      const matching = () => rows().filter((row) => conditions.every(([field, value]) => row[field] === value));
      const builder = { eq: (field: string, value: unknown) => { conditions.push([field, value]); return builder; } };
      const result = {
        collect: async () => matching(),
        unique: async () => {
          const found = matching();
          if (found.length > 1) throw new Error(`Query for '${table}' returned more than one result`);
          return found[0] ?? null;
        },
        first: async () => matching()[0] ?? null,
        order: () => result,
        paginate: async (paginationOpts: { numItems: number; cursor: string | null }) => {
          const all = matching();
          const start = paginationOpts.cursor ? all.findIndex((row) => row._id === paginationOpts.cursor) + 1 : 0;
          const page = all.slice(start, start + paginationOpts.numItems);
          const isDone = start + page.length >= all.length;
          return { page, isDone, continueCursor: isDone ? "" : (page[page.length - 1]?._id ?? "") };
        },
      };
      return { withIndex: (_index: string, apply?: (query: typeof builder) => typeof builder) => { apply?.(builder); return result; }, ...result };
    },
  };

  const ctx = { auth: { getUserIdentity: async () => identity ?? null }, db };
  return { ctx: ctx as unknown as MutationCtx, tables };
}

type Handler<Args, Result> = (ctx: MutationCtx, args: Args) => Promise<Result>;
export const handlerOf = <Args, Result>(fn: unknown) => (fn as { _handler: Handler<Args, Result> })._handler;

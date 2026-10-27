// Test-only: a stand-in for a supabase-js client. Every query-builder call is recorded, and
// awaiting a query resolves to the result the test configured for its table or function.
// Policy behavior isn't faked here: it's tested against the real migrations on pglite (packages/db).
import type { OwnerClient } from "./owner";

export type FakeResult = {
  data?: unknown;
  error?: { code: string; message: string; details?: string | null; hint?: string | null } | null;
  count?: number | null;
};

/** One query: the table or function, and every builder method called on it, in order. */
export type FakeCall = { target: string; kind: "from" | "rpc" | "storage"; ops: [method: string, ...args: unknown[]][] };

type Responder = FakeResult | ((call: FakeCall) => FakeResult);

export type FakeHandlers = {
  from?: Record<string, Responder | Responder[]>;
  rpc?: Record<string, Responder | Responder[]>;
  /** Keyed by bucket; answers every storage call on it (e.g. `remove`). */
  storage?: Record<string, Responder>;
};

export type FakeSupabase = OwnerClient & { calls: FakeCall[] };

/**
 * A fake client. A table's responder may be a list: each query on that table takes the next one
 * (the last repeats). Unconfigured queries resolve to `{ data: null, error: null }`.
 */
export function fakeSupabase(handlers: FakeHandlers = {}): FakeSupabase {
  const calls: FakeCall[] = [];
  const used = new Map<string, number>();

  const respond = (call: FakeCall, responder: Responder | Responder[] | undefined): FakeResult => {
    let next = responder;
    if (Array.isArray(next)) {
      const key = `${call.kind}:${call.target}`;
      const i = used.get(key) ?? 0;
      used.set(key, i + 1);
      next = next[Math.min(i, next.length - 1)];
    }
    const result = typeof next === "function" ? next(call) : next;
    return { data: result?.data ?? null, error: result?.error ?? null, count: result?.count ?? null };
  };

  const builder = (call: FakeCall, responder: Responder | Responder[] | undefined): unknown => {
    let settled: FakeResult | undefined;
    const proxy: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            return (resolve: (value: FakeResult) => unknown, reject?: (reason: unknown) => unknown) => {
              try {
                settled ??= respond(call, responder);
                return Promise.resolve(settled).then(resolve, reject);
              } catch (error) {
                return Promise.reject(error).then(resolve, reject);
              }
            };
          }
          return (...args: unknown[]) => {
            call.ops.push([String(prop), ...args]);
            return proxy;
          };
        },
      },
    );
    return proxy;
  };

  const client = {
    calls,
    from(table: string) {
      const call: FakeCall = { target: table, kind: "from", ops: [] };
      calls.push(call);
      return builder(call, handlers.from?.[table]);
    },
    rpc(fn: string, args?: unknown) {
      const call: FakeCall = { target: fn, kind: "rpc", ops: [["args", args]] };
      calls.push(call);
      return builder(call, handlers.rpc?.[fn]);
    },
    storage: {
      from(bucket: string) {
        const call: FakeCall = { target: bucket, kind: "storage", ops: [] };
        calls.push(call);
        return builder(call, handlers.storage?.[bucket]);
      },
    },
  };
  return client as unknown as FakeSupabase;
}

/** The calls made on one table or function, in order. */
export const callsTo = (fake: FakeSupabase, target: string) => fake.calls.filter((call) => call.target === target);

/** The arguments of the first `method` call in a query, or undefined. */
export const argsOf = (call: FakeCall | undefined, method: string) => call?.ops.find(([name]) => name === method)?.slice(1);

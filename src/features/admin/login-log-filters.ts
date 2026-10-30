import { z } from "zod";
import type { LoginLogFilters } from "@/server/services/login-log";
import { LOGIN_RESULTS } from "@/server/state/login-log";

/** Giriş kayıtları süzgeci: sayfa ve Excel indirme adresi aynı sorgu parametrelerini kullanır (karar #215). */
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const schema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  result: z.enum([...LOGIN_RESULTS, "failed"]).optional().catch(undefined),
  from: z.string().regex(DATE).optional().catch(undefined),
  to: z.string().regex(DATE).optional().catch(undefined),
});

export function parseLoginLogFilters(input: Record<string, string | string[] | undefined>): LoginLogFilters {
  const one = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v : undefined);
  const p = schema.parse({ q: one(input.q), result: one(input.result), from: one(input.from), to: one(input.to) });
  return { q: p.q || null, result: p.result ?? null, from: p.from ?? null, to: p.to ?? null };
}

export function loginLogQuery(f: LoginLogFilters, extra: Record<string, string> = {}): string {
  const entries = Object.entries({ q: f.q, result: f.result, from: f.from, to: f.to, ...extra }).filter((e): e is [string, string] => !!e[1]);
  return new URLSearchParams(entries).toString();
}

import { connection, NextResponse } from "next/server";
import { checkHealth } from "@/server/services/health";

/**
 * Sağlık kontrolü (ters vekil sunucu ve izleme için). Kişisel veri döndürmez.
 * 200: veritabanı ve depolama erişilebilir, 503: biri erişilemiyor.
 */
export async function GET() {
  await connection();
  const { ok, database, storage } = await checkHealth();
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", database, storage },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}

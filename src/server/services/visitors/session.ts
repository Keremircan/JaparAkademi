import { createHash, randomBytes, randomInt } from "node:crypto";
import { createTranslator } from "next-intl";
import { and, eq, gt, inArray } from "drizzle-orm";
import { db, type DbOrTx, type Tx } from "@/server/db/client";
import { emailOutbox, visitors, visits, visitSessions } from "@/server/db/schema";
import { env } from "@/server/env";
import { endOfDayIn, todayIn } from "@/lib/dates";
import { emailHtml } from "@/server/state/notifications";
import en from "../../../../messages/en.json";
import tr from "../../../../messages/tr.json";
import { getSetting } from "../settings";

/**
 * Ziyaretçi oturumu (iş paketi 2.3a, karar #137): ziyaretçinin hesabı yoktur. E-posta bağlantısı, kiosk kodu ya da
 * kendi kaydı tek ziyarete bağlı süreli bir belirteç açar; belirteç yalnızca SHA-256 özetiyle saklanır.
 * Geçerlilik ziyaret gününün sonuna kadardır (`org.timezone`).
 */

export const hashVisitToken = (token: string) => createHash("sha256").update(token).digest("hex");
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Açık ziyaretler (planlandı / bilgilendirildi) arasında benzersiz 6 haneli kod (karar #138). */
export async function newVisitCode(conn: DbOrTx): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const [taken] = await conn
      .select({ id: visits.id })
      .from(visits)
      .where(and(eq(visits.code, code), inArray(visits.status, ["planned", "briefed"])))
      .limit(1);
    if (!taken) return code;
  }
  throw new Error("Boş ziyaret kodu bulunamadı");
}

export async function issueVisitSession(tx: Tx, visitId: string, channel: "link" | "kiosk" | "self", plannedDate: string): Promise<string> {
  const tz = await getSetting("org.timezone", tx);
  const token = randomBytes(32).toString("base64url");
  await tx.insert(visitSessions).values({ visitId, channel, tokenHash: hashVisitToken(token), expiresAt: endOfDayIn(plannedDate, tz) });
  return token;
}

/** Belirtecin ziyareti; süresi dolmuş, iptal edilmiş ya da başka güne ait ziyarette null. */
export async function visitForToken(token: string) {
  if (!TOKEN.test(token)) return null;
  const [row] = await db()
    .select({ visitId: visitSessions.visitId, channel: visitSessions.channel })
    .from(visitSessions)
    .where(and(eq(visitSessions.tokenHash, hashVisitToken(token)), gt(visitSessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  const [visit] = await db().select().from(visits).where(eq(visits.id, row.visitId)).limit(1);
  if (!visit || visit.status === "cancelled") return null;
  // Bilgilendirme yalnızca ziyaret günü (önceden gelen bağlantı dahil, gün sonuna kadar) yapılır
  const today = todayIn(await getSetting("org.timezone"));
  if (visit.plannedDate < today) return null;
  return { visit, channel: row.channel };
}

/**
 * Ön kayıtta e-posta varsa bilgilendirme bağlantısı gönderilir (karar #137). İçerik iki dilli,
 * ziyaret kodu ve tarihi dışında kişisel veri içermez. Bağlantı ziyaret gününün sonuna kadar geçerlidir.
 */
export async function sendVisitLink(tx: Tx, visitId: string): Promise<boolean> {
  const [row] = await tx
    .select({ email: visitors.email, plannedDate: visits.plannedDate, code: visits.code, status: visits.status })
    .from(visits)
    .innerJoin(visitors, eq(visitors.id, visits.visitorId))
    .where(eq(visits.id, visitId))
    .limit(1);
  if (!row?.email || row.status !== "planned") return false;
  const token = await issueVisitSession(tx, visitId, "link", row.plannedDate);
  const url = new URL(`/v/${token}`, env().APP_URL).toString();
  const urlEn = new URL(`/en/v/${token}`, env().APP_URL).toString();
  const tTr = createTranslator({ locale: "tr", messages: tr, namespace: "visitorFlow.email" });
  const tEn = createTranslator({ locale: "en", messages: en, namespace: "visitorFlow.email" });
  const date = row.plannedDate.split("-").reverse().join(".");
  const subject = `${tTr("subject")} / ${tEn("subject")}`;
  const bodyTr = tTr("body", { date, code: row.code });
  const bodyEn = tEn("body", { date, code: row.code });
  await tx.insert(emailOutbox).values({
    kind: "visitor_link",
    toAddress: row.email,
    subject,
    bodyText: `${bodyTr}\n${url}\n\n${bodyEn}\n${urlEn}\n\n${tTr("footer")}`,
    bodyHtml:
      emailHtml({ heading: tTr("subject"), body: bodyTr, linkLabel: tTr("open"), url, footer: tTr("footer") }) +
      emailHtml({ heading: tEn("subject"), body: bodyEn, linkLabel: tEn("open"), url: urlEn, footer: tEn("footer") }),
  });
  return true;
}


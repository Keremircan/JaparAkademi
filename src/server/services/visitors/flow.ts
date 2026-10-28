import { randomInt } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { systemActor } from "@/server/authz/actor";
import { db } from "@/server/db/client";
import { contractorClearances, contractorCompanies, mediaAssets, visitors, visitorConsents, visitorSignatures, visitQuizAttempts, visits, type VisitQuizItem } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { NotFoundError, ValidationError } from "@/server/errors";
import { todayIn } from "@/lib/dates";
import { signedGetUrl } from "@/server/storage/client";
import { createRateLimiter } from "@/server/state/certification";
import { briefingMinSeconds, canTransition, quizScore } from "@/server/state/visits";
import { currentText } from "../legal";
import { assetsInfo } from "../media";
import { notify } from "../notifications";
import { getSettings } from "../settings";
import { subjectHash, uploadSignatureImage } from "../signatures";
import { currentBriefing, getBriefingContent, type VisitorType } from "./briefings";
import { activeClearanceUntil } from "./gate";
import { subtractYears } from "@/server/state/retention";
import { cleanContact } from "./identity";
import { issueVisitSession, newVisitCode, visitForToken } from "./session";

/**
 * Ziyaretçi bilgilendirme akışı (SPEC 8.2/3–5, iş paketi 2.3a, kararlar #137–146).
 * Hesap yok: her çağrı ziyaret belirteciyle yapılır (`visitForToken`). Aktör sistemdir ("visitor").
 * Sıra: dil + başlat → kartlar (en az süre) → kontrol soruları (rastgele, sınırsız tekrar) → kurallar + KVKK onayı + imza.
 */
const visitorActor = systemActor("visitor");
export type Locale = "tr" | "en";
export type RequestMeta = { ip: string | null; userAgent: string | null };

async function requireVisit(token: string) {
  const found = await visitForToken(token);
  if (!found) throw new NotFoundError("visit");
  return found.visit;
}

async function legalFor(locale: Locale) {
  const [rules, kvkk] = await Promise.all([currentText("visitor_rules", locale), currentText("kvkk_visitor", locale)]);
  return { rules, kvkk };
}

/** Ziyaretçi ekranının durumu. Doğru cevap hiçbir zaman dönmez. */
export async function visitorView(token: string, locale: Locale) {
  const found = await visitForToken(token);
  if (!found) return { state: "invalid" as const };
  const { visit, channel } = found;
  const [visitor] = await db().select({ fullName: visitors.fullName }).from(visitors).where(eq(visitors.id, visit.visitorId)).limit(1);
  const base = { code: visit.code, visitorType: visit.visitorType as VisitorType, firstName: visitor!.fullName.split(" ")[0] ?? "", channel };
  if (visit.status !== "planned") return { state: "done" as const, ...base };

  const { "visitor.types": types } = await getSettings(["visitor.types"]);
  const settings = types[base.visitorType];
  // Başlatılmışsa o sürüm; değilse güncel yayın
  const briefing = visit.briefingId ? await getBriefingContent(visit.briefingId) : await currentBriefing(base.visitorType);
  const legal = await legalFor(locale);
  if (!briefing || !legal.rules || !legal.kvkk) return { state: "not_ready" as const, ...base };

  const assetIds = briefing.cards.map((c) => c.mediaAssetId).filter((x): x is string => !!x);
  const assets = assetIds.length ? await assetsInfo(assetIds) : new Map();
  const [passed] = await db()
    .select({ id: visitQuizAttempts.id })
    .from(visitQuizAttempts)
    .where(and(eq(visitQuizAttempts.visitId, visit.id), eq(visitQuizAttempts.passed, true)))
    .limit(1);
  // Geçerli taşeron: kartlar ve sorular atlanır, yalnızca onay + imza (karar #152)
  const clearanceUntil = base.visitorType === "contractor" ? await activeClearanceUntil(visit.visitorId) : null;
  return {
    state: "ready" as const,
    ...base,
    clearanceUntil,
    started: visit.briefingStartedAt !== null && visit.briefingLocale === locale,
    cardMinSeconds: settings.cardMinSeconds,
    questionCount: clearanceUntil ? 0 : settings.questionCount,
    quizPassed: clearanceUntil !== null || settings.questionCount === 0 || !!passed,
    cards: (clearanceUntil ? [] : briefing.cards).map((c) => {
      const a = c.mediaAssetId ? assets.get(c.mediaAssetId) : null;
      return {
        id: c.id,
        title: locale === "en" ? c.titleEn : c.titleTr,
        body: locale === "en" ? c.bodyEn : c.bodyTr,
        media: a && a.status === "ready" ? { id: a.id, kind: a.kind as "image" | "video" } : null,
      };
    }),
    rules: { id: legal.rules.id, title: legal.rules.title, body: legal.rules.body },
    kvkk: { id: legal.kvkk.id, title: legal.kvkk.title, body: legal.kvkk.body },
  };
}

/** Dil seçimi ve başlangıç: güncel paket sürümü ziyarete yazılır, süre baştan başlar. */
export async function startBriefing(token: string, locale: Locale): Promise<void> {
  const visit = await requireVisit(token);
  if (visit.status !== "planned") throw new ValidationError("visit_locked");
  const briefing = await currentBriefing(visit.visitorType as VisitorType);
  if (!briefing) throw new ValidationError("briefing_not_ready");
  await withActor(visitorActor, (tx) =>
    tx
      .update(visits)
      .set({ briefingId: briefing.briefing.id, briefingLocale: locale, briefingStartedAt: new Date() })
      .where(eq(visits.id, visit.id)),
  );
}

/** Kartların okunması için gereken en az süre geçti mi (sunucu doğrular, karar #141). */
async function assertCardsRead(visit: typeof visits.$inferSelect) {
  if (!visit.briefingId || !visit.briefingStartedAt) throw new ValidationError("briefing_not_started");
  const content = await getBriefingContent(visit.briefingId);
  if (await isCleared(visit)) return content;
  const { "visitor.types": types } = await getSettings(["visitor.types"]);
  const ids = content.cards.map((c) => c.mediaAssetId).filter((x): x is string => !!x);
  const info = ids.length ? await assetsInfo(ids) : new Map();
  const durations = content.cards.map((c) => (c.mediaAssetId ? (info.get(c.mediaAssetId)?.durationSec ?? 0) : 0));
  const min = briefingMinSeconds(durations, types[visit.visitorType].cardMinSeconds);
  if (Date.now() - visit.briefingStartedAt.getTime() < min * 1000) throw new ValidationError("briefing_too_fast");
  return content;
}

/** Taşeron geçerliliği sürüyor mu (karar #152). */
async function isCleared(visit: typeof visits.$inferSelect): Promise<boolean> {
  return visit.visitorType === "contractor" && (await activeClearanceUntil(visit.visitorId)) !== null;
}

function shuffle(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Kontrol soruları: paketten tipin soru sayısı kadar rastgele soru, şıklar karışık (karar #141).
 * Teslim edilmemiş deneme varsa aynısı döner (sayfa yenilense de sorular değişmez).
 */
export async function drawQuiz(token: string, locale: Locale) {
  const visit = await requireVisit(token);
  if (visit.status !== "planned") throw new ValidationError("visit_locked");
  const content = await assertCardsRead(visit);
  const { "visitor.types": types } = await getSettings(["visitor.types"]);
  const count = (await isCleared(visit)) ? 0 : types[visit.visitorType].questionCount;
  if (count === 0) return { attemptId: null, questions: [] };

  let [attempt] = await db()
    .select()
    .from(visitQuizAttempts)
    .where(and(eq(visitQuizAttempts.visitId, visit.id), eq(visitQuizAttempts.briefingId, visit.briefingId!), isNull(visitQuizAttempts.submittedAt)))
    .limit(1);
  if (!attempt) {
    if (content.questions.length < count) throw new ValidationError("briefing_not_ready");
    const picked = shuffle(content.questions.length).slice(0, count);
    const items: VisitQuizItem[] = picked.map((i) => {
      const q = content.questions[i]!;
      return { questionId: q.id, optionOrder: shuffle(q.optionsTr.length), answer: null, correct: null };
    });
    [attempt] = await withActor(visitorActor, (tx) => tx.insert(visitQuizAttempts).values({ visitId: visit.id, briefingId: visit.briefingId!, items }).returning());
  }
  const byId = new Map(content.questions.map((q) => [q.id, q]));
  return {
    attemptId: attempt!.id,
    questions: attempt!.items.map((it) => {
      const q = byId.get(it.questionId)!;
      const options = locale === "en" ? q.optionsEn : q.optionsTr;
      return { stem: locale === "en" ? q.stemEn : q.stemTr, options: it.optionOrder.map((o) => options[o]!) };
    }),
  };
}

/** Deneme teslimi: cevaplar gösterilen sıradaki şık numarasıdır. Doğru cevap ziyaretçiye dönmez. */
export async function submitQuiz(token: string, attemptId: string, answers: number[]): Promise<{ passed: boolean; score: number }> {
  const visit = await requireVisit(token);
  if (visit.status !== "planned") throw new ValidationError("visit_locked");
  const content = await assertCardsRead(visit);
  const [attempt] = await db()
    .select()
    .from(visitQuizAttempts)
    .where(and(eq(visitQuizAttempts.id, attemptId), eq(visitQuizAttempts.visitId, visit.id), isNull(visitQuizAttempts.submittedAt)))
    .limit(1);
  if (!attempt) throw new NotFoundError("quiz_attempt");
  if (answers.length !== attempt.items.length) throw new ValidationError("quiz_incomplete");
  const byId = new Map(content.questions.map((q) => [q.id, q]));
  const items = attempt.items.map((it, i) => {
    const shown = answers[i]!;
    if (!Number.isInteger(shown) || shown < 0 || shown >= it.optionOrder.length) throw new ValidationError("quiz_incomplete");
    const original = it.optionOrder[shown]!;
    return { ...it, answer: original, correct: original === byId.get(it.questionId)!.correctIndex };
  });
  const { "visitor.types": types } = await getSettings(["visitor.types"]);
  const { score, passed } = quizScore(items.map((x) => x.correct === true), types[visit.visitorType].passScore);
  await withActor(visitorActor, async (tx) => {
    await tx.update(visitQuizAttempts).set({ items, score, passed, submittedAt: new Date() }).where(eq(visitQuizAttempts.id, attempt.id));
    if (passed) await tx.update(visits).set({ quizScore: score }).where(eq(visits.id, visit.id));
  });
  return { passed, score };
}

/**
 * Onay ve imza (karar #142): kurallar ve KVKK metni (seçilen dildeki yayın) + parmakla imza.
 * Tamamlanınca ziyaret "bilgilendirildi" olur ve ev sahibine bildirim gider.
 */
export async function completeBriefing(
  token: string,
  input: { locale: Locale; rulesId: string; kvkkId: string; signature: string },
  meta: RequestMeta,
): Promise<void> {
  const visit = await requireVisit(token);
  if (!canTransition(visit.status, "briefed")) throw new ValidationError("visit_locked");
  await assertCardsRead(visit);
  const { "visitor.types": types, "org.timezone": tz } = await getSettings(["visitor.types", "org.timezone"]);
  const cleared = await isCleared(visit);
  if (!cleared && types[visit.visitorType].questionCount > 0) {
    const [passed] = await db()
      .select({ id: visitQuizAttempts.id })
      .from(visitQuizAttempts)
      .where(and(eq(visitQuizAttempts.visitId, visit.id), eq(visitQuizAttempts.briefingId, visit.briefingId!), eq(visitQuizAttempts.passed, true)))
      .limit(1);
    if (!passed) throw new ValidationError("quiz_not_passed");
  }
  const legal = await legalFor(input.locale);
  if (!legal.rules || !legal.kvkk || legal.rules.id !== input.rulesId || legal.kvkk.id !== input.kvkkId) throw new ValidationError("legal_text_outdated");

  const image = await uploadSignatureImage(input.signature, "visitor-signatures");
  const hash = subjectHash({ visitId: visit.id, briefingId: visit.briefingId, legalTextIds: [legal.rules.id, legal.kvkk.id], quizScore: visit.quizScore });
  const ua = meta.userAgent?.slice(0, 500) ?? null;
  const [visitor] = await db().select({ fullName: visitors.fullName }).from(visitors).where(eq(visitors.id, visit.visitorId)).limit(1);
  await withActor(visitorActor, async (tx) => {
    await tx.insert(visitorConsents).values([
      { visitId: visit.id, legalTextId: legal.rules!.id, ip: meta.ip, userAgent: ua },
      { visitId: visit.id, legalTextId: legal.kvkk!.id, ip: meta.ip, userAgent: ua },
    ]);
    await tx.insert(visitorSignatures).values({ visitId: visit.id, visitorId: visit.visitorId, subjectHash: hash, imageKey: image.key, ip: meta.ip, userAgent: ua });
    await tx.update(visits).set({ status: "briefed", briefingCompletedAt: new Date() }).where(eq(visits.id, visit.id));
    // Bilgilendirmeyi geçen taşerona geçerlilik (karar #152); kısa yolla tamamlanan ziyaret süreyi uzatmaz
    const years = types[visit.visitorType].validityYears;
    if (visit.visitorType === "contractor" && !cleared && years > 0) {
      await tx.insert(contractorClearances).values({ visitorId: visit.visitorId, visitId: visit.id, validUntil: subtractYears(todayIn(tz), -years) });
    }
    // SPEC 10.2: ev sahibine "bilgilendirmeyi tamamladı" (kendi kaydında ev sahibi henüz yok)
    if (visit.hostUserId) {
      await notify(tx, {
        kind: "visitor_briefed",
        userIds: [visit.hostUserId],
        subjectKey: `visit:${visit.id}`,
        link: `/visits/${visit.id}`,
        params: { name: visitor!.fullName },
      });
    }
  });
}

// ---- Kiosk ve kendi kaydı (kararlar #138–140, #146) ----

const codeLimiter = createRateLimiter();
const selfLimiter = createRateLimiter();

/** Kiosk: bugünkü açık ziyaretin kodu → ziyaretçi oturumu. Cihaz başına hatalı deneme sınırı. */
export async function enterVisitCode(deviceId: string, code: string): Promise<{ token: string } | "rate_limited" | null> {
  const s = await getSettings(["org.timezone", "visitor.code_max_attempts", "visitor.code_window_min"]);
  if (!codeLimiter(`kiosk:${deviceId}`, s["visitor.code_max_attempts"], s["visitor.code_window_min"] * 60_000)) return "rate_limited";
  if (!/^\d{6}$/.test(code)) return null;
  const today = todayIn(s["org.timezone"]);
  const [visit] = await db()
    .select({ id: visits.id, plannedDate: visits.plannedDate })
    .from(visits)
    .where(and(eq(visits.code, code), eq(visits.plannedDate, today), eq(visits.status, "planned")))
    .limit(1);
  if (!visit) return null;
  const token = await withActor(visitorActor, (tx) => issueVisitSession(tx, visit.id, "kiosk", visit.plannedDate));
  return { token };
}

export type SelfRegistration = {
  visitorType: VisitorType;
  fullName: string;
  companyName?: string | null;
  contractorCompanyId?: string | null;
  phone?: string | null;
  email?: string | null;
  hostName: string;
};

/** Ön kaydı olmayan ziyaretçi (QR ya da kiosk): ev sahibi adı serbest metin, güvenlik girişte atar (karar #139). */
export async function selfRegister(input: SelfRegistration, rateKey: string, channel: "self" | "kiosk"): Promise<{ token: string } | "rate_limited"> {
  const s = await getSettings(["org.timezone", "visitor.types", "visitor.selfreg_max", "visitor.selfreg_window_min"]);
  if (!selfLimiter(rateKey, s["visitor.selfreg_max"], s["visitor.selfreg_window_min"] * 60_000)) return "rate_limited";
  if (!s["visitor.types"][input.visitorType]?.enabled) throw new ValidationError("visitor_type_disabled");
  const fullName = input.fullName.trim();
  const hostName = input.hostName.trim();
  if (fullName.length < 2 || fullName.length > 200) throw new ValidationError("invalid_name");
  if (hostName.length < 2 || hostName.length > 200) throw new ValidationError("host_name_required");
  const contact = cleanContact(input);
  if (!contact.phone && !contact.email) throw new ValidationError("contact_required");
  let companyName = input.companyName?.trim().slice(0, 200) || null;
  let contractorCompanyId: string | null = null;
  if (input.visitorType === "contractor") {
    const [company] = input.contractorCompanyId
      ? await db()
          .select({ id: contractorCompanies.id, name: contractorCompanies.name })
          .from(contractorCompanies)
          .where(and(eq(contractorCompanies.id, input.contractorCompanyId), isNull(contractorCompanies.archivedAt)))
          .limit(1)
      : [];
    if (!company) throw new ValidationError("company_required");
    contractorCompanyId = company.id;
    companyName = company.name;
  }
  const today = todayIn(s["org.timezone"]);
  const token = await withActor(visitorActor, async (tx) => {
    const [visitor] = await tx.insert(visitors).values({ fullName, companyName, contractorCompanyId, ...contact }).returning({ id: visitors.id });
    const [visit] = await tx
      .insert(visits)
      .values({
        visitorId: visitor!.id,
        visitorType: input.visitorType,
        hostNameText: hostName,
        plannedDate: today,
        code: await newVisitCode(tx),
        selfRegistered: true,
      })
      .returning({ id: visits.id });
    return issueVisitSession(tx, visit!.id, channel === "kiosk" ? "kiosk" : "self", today);
  });
  return { token };
}

/** Ziyaretçi ekranındaki görsel/video: yalnızca ziyaretin (başlatılmış ya da güncel) paketindeki kartlar. */
export async function visitorAssetAllowed(token: string, assetId: string): Promise<boolean> {
  const found = await visitForToken(token);
  if (!found) return false;
  const { visit } = found;
  const content = visit.briefingId ? await getBriefingContent(visit.briefingId) : await currentBriefing(visit.visitorType as VisitorType);
  return !!content?.cards.some((c) => c.mediaAssetId === assetId);
}


/** Ziyaretçi ekranındaki kart görseli/videosu için imzalı adres (karar #141). */
export async function visitorAssetUrl(token: string, assetId: string, variant: "image" | "file" | "poster"): Promise<string | null> {
  if (!(await visitorAssetAllowed(token, assetId))) return null;
  const [asset] = await db().select().from(mediaAssets).where(eq(mediaAssets.id, assetId)).limit(1);
  if (!asset || asset.status !== "ready") return null;
  const key = variant === "image" ? (asset.derived.webpKey ?? asset.objectKey) : variant === "poster" ? asset.derived.posterKey : asset.objectKey;
  if (!key) return null;
  return signedGetUrl(key, undefined, { contentType: variant === "file" ? asset.mime : undefined });
}

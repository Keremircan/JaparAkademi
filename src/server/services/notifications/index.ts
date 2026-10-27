import { createTranslator } from "next-intl";
import { and, count, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { assertUser } from "@/server/authz/policy";
import type { Role } from "@/server/authz/roles";
import { db, type DbOrTx, type Tx } from "@/server/db/client";
import { emailOutbox, notifications, orgUnits, personnel, positions, roleScopes, userRoles, users } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { NotFoundError } from "@/server/errors";
import { env } from "@/server/env";
import { emailHtml, type NotificationKind } from "@/server/state/notifications";
import messages from "../../../../messages/tr.json";
import { getSettings } from "../settings";

/**
 * Bildirim çekirdeği (SPEC 10.2, karar #84–90).
 *  - Olayla aynı transaction'da yazılır: olay geri alınırsa bildirim de oluşmaz.
 *  - Aynı kişiye aynı konu için okunmamış tek bildirim tutulur; yeni olay mevcut bildirimi tazeler (e-posta tekrar gitmez).
 *  - E-posta yalnızca `notify.email_events` türlerinde ve kişinin e-postası varsa; içerik genel başlık + bağlantıdır.
 */

export type NotifyInput = {
  kind: NotificationKind;
  userIds: readonly (string | null | undefined)[];
  subjectKey: string;
  link: string;
  params?: Record<string, string | number>;
  /** Bildirim gönderilmeyecek kişiler (ör. işlemi yapan, kursiyerin kendisi). */
  exclude?: readonly (string | null | undefined)[];
};

function emailContent(kind: NotificationKind, link: string) {
  const t = createTranslator({ locale: "tr", messages, namespace: "notifications.email" });
  const url = new URL(link, env().APP_URL).toString();
  const subject = t(`kinds.${kind}`);
  const body = t("body");
  return {
    subject: `${subject} · ${t("app")}`,
    text: `${subject}\n\n${body}\n${url}\n\n${t("footer")}`,
    html: emailHtml({ heading: subject, body, linkLabel: t("open"), url, footer: t("footer") }),
  };
}

export async function notify(tx: Tx, input: NotifyInput): Promise<void> {
  const exclude = new Set(input.exclude?.filter(Boolean));
  const ids = [...new Set(input.userIds.filter((u): u is string => !!u && !exclude.has(u)))];
  if (ids.length === 0) return;
  const { "notify.email_events": emailEvents } = await getSettings(["notify.email_events"], tx);
  const wantsEmail = emailEvents.includes(input.kind);
  const emails = wantsEmail
    ? new Map(
        (
          await tx
            .select({ userId: personnel.userId, email: personnel.email })
            .from(personnel)
            .where(and(inArray(personnel.userId, ids), eq(personnel.status, "active")))
        ).map((r) => [r.userId, r.email]),
      )
    : new Map<string, string | null>();

  for (const userId of ids) {
    const [existing] = await tx
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.kind, input.kind), eq(notifications.subjectKey, input.subjectKey), isNull(notifications.readAt)))
      .limit(1);
    if (existing) {
      await tx.update(notifications).set({ params: input.params ?? {}, link: input.link }).where(eq(notifications.id, existing.id));
      continue;
    }
    const [n] = await tx
      .insert(notifications)
      .values({ userId, kind: input.kind, subjectKey: input.subjectKey, params: input.params ?? {}, link: input.link })
      .returning({ id: notifications.id });
    const to = emails.get(userId);
    if (wantsEmail && to) {
      const c = emailContent(input.kind, input.link);
      await tx.insert(emailOutbox).values({ notificationId: n!.id, kind: input.kind, toAddress: to, subject: c.subject, bodyText: c.text, bodyHtml: c.html });
    }
  }
}

/**
 * Konu kapandığında (onaylandı, reddedildi, karar verildi) o konunun okunmamış bildirimlerini herkes için
 * okundu sayar; böylece başkasının tamamladığı iş bekliyor görünmez.
 */
export async function resolveNotifications(tx: Tx, subjectKey: string, kind?: NotificationKind): Promise<void> {
  await tx
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.subjectKey, subjectKey), isNull(notifications.readAt), ...(kind ? [eq(notifications.kind, kind)] : [])));
}

// ---------------------------------------------------------------------------
// Alıcılar
// ---------------------------------------------------------------------------

/** Rolü olan aktif personel. */
export async function usersWithRole(conn: DbOrTx, role: Role): Promise<string[]> {
  const rows = await conn
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .innerJoin(personnel, eq(personnel.userId, userRoles.userId))
    .where(and(eq(userRoles.role, role), eq(personnel.status, "active")));
  return rows.map((r) => r.userId);
}

/** Birimi kapsamında tutan bölüm sorumluları (birimin kendisi ya da üst düğümü; ağaç iki seviyeli). */
export async function sectionManagersForUnit(conn: DbOrTx, orgUnitId: string): Promise<string[]> {
  const [unit] = await conn.select({ id: orgUnits.id, parentId: orgUnits.parentId }).from(orgUnits).where(eq(orgUnits.id, orgUnitId)).limit(1);
  if (!unit) return [];
  const targets = [unit.id, ...(unit.parentId ? [unit.parentId] : [])];
  const rows = await conn
    .selectDistinct({ userId: roleScopes.userId })
    .from(roleScopes)
    .innerJoin(userRoles, and(eq(userRoles.userId, roleScopes.userId), eq(userRoles.role, "section_manager")))
    .innerJoin(personnel, eq(personnel.userId, roleScopes.userId))
    .where(and(eq(roleScopes.role, "section_manager"), inArray(roleScopes.orgUnitId, targets), eq(personnel.status, "active")));
  return rows.map((r) => r.userId);
}

/** Kişiyi kapsamında tutan bölüm sorumluları (pozisyonunun birimine göre). */
export async function sectionManagersForPerson(conn: DbOrTx, userId: string): Promise<string[]> {
  const [p] = await conn
    .select({ orgUnitId: positions.orgUnitId })
    .from(personnel)
    .innerJoin(positions, eq(positions.id, personnel.positionId))
    .where(eq(personnel.userId, userId))
    .limit(1);
  return p ? sectionManagersForUnit(conn, p.orgUnitId) : [];
}

/** Onay adımına göre onaylayacak kişilere bildirim (içerik, kart, soru). Onay kuyruğuna yönlendirir. */
export async function notifyApprovalPending(
  tx: Tx,
  input: { type: "content" | "card" | "question"; step: "section" | "ohs"; ownerOrgUnitId: string | null; subjectKey: string; title: string; submittedBy: string | null },
): Promise<void> {
  const userIds =
    input.step === "ohs" ? await usersWithRole(tx, "ohs_specialist") : input.ownerOrgUnitId ? await sectionManagersForUnit(tx, input.ownerOrgUnitId) : await usersWithRole(tx, "hr");
  await notify(tx, { kind: "approval_pending", userIds, subjectKey: input.subjectKey, link: "/manage/approvals", params: { type: input.type, title: input.title }, exclude: [input.submittedBy] });
}

/** Tüm haklarda başarısız (SPEC 3.1): İK + kapsamdaki bölüm sorumlusu (+ İSG modülünde İSG uzmanı). */
export async function notifyAllAttemptsFailed(tx: Tx, input: { assignmentId: string; traineeUserId: string; examTitle: string; isOhs: boolean }): Promise<void> {
  const [u] = await tx.select({ name: users.name }).from(users).where(eq(users.id, input.traineeUserId)).limit(1);
  const userIds = [
    ...(await usersWithRole(tx, "hr")),
    ...(await sectionManagersForPerson(tx, input.traineeUserId)),
    ...(input.isOhs ? await usersWithRole(tx, "ohs_specialist") : []),
  ];
  await notify(tx, {
    kind: "all_attempts_failed",
    userIds,
    subjectKey: `decision:${input.assignmentId}`,
    link: `/manage/readiness/${input.assignmentId}`,
    params: { name: u?.name ?? "", title: input.examTitle },
    exclude: [input.traineeUserId],
  });
}

// ---------------------------------------------------------------------------
// Kullanıcı görünümü
// ---------------------------------------------------------------------------

export type NotificationView = { id: string; kind: NotificationKind; params: Record<string, string | number>; link: string; read: boolean; at: Date };

const PAGE = 30;

export async function myNotifications(actor: Actor, page = 1): Promise<{ items: NotificationView[]; total: number; page: number; pages: number }> {
  assertUser(actor);
  const where = eq(notifications.userId, actor.userId);
  const [{ n }] = (await db().select({ n: count() }).from(notifications).where(where)) as [{ n: number }];
  const pages = Math.max(1, Math.ceil(n / PAGE));
  const p = Math.min(Math.max(1, page), pages);
  const rows = await db()
    .select()
    .from(notifications)
    .where(where)
    .orderBy(sql`${notifications.readAt} is not null`, desc(notifications.updatedAt))
    .limit(PAGE)
    .offset((p - 1) * PAGE);
  return {
    items: rows.map((r) => ({ id: r.id, kind: r.kind as NotificationKind, params: r.params, link: r.link, read: !!r.readAt, at: r.updatedAt })),
    total: n,
    page: p,
    pages,
  };
}

export async function unreadCount(actor: Actor): Promise<number> {
  if (actor.kind !== "user") return 0;
  const [{ n }] = (await db()
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, actor.userId), isNull(notifications.readAt)))) as [{ n: number }];
  return n;
}

/** Okundu işaretler ve gidilecek bağlantıyı döner (yalnızca kendi bildirimi). */
export async function openNotification(actor: Actor, id: string): Promise<{ link: string }> {
  assertUser(actor);
  return withActor(actor, async (tx) => {
    const [n] = await tx.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.userId, actor.userId))).limit(1);
    if (!n) throw new NotFoundError("notification");
    if (!n.readAt) await tx.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, n.id));
    return { link: n.link };
  });
}

export async function markAllRead(actor: Actor): Promise<void> {
  assertUser(actor);
  await withActor(actor, async (tx) => {
    await tx.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, actor.userId), isNull(notifications.readAt)));
  });
}

/** Saklama süresi dolan bildirimleri siler (worker, günlük; karar #90). */
export async function purgeOldNotifications(actor: Actor): Promise<number> {
  const { "notify.retention_days": days } = await getSettings(["notify.retention_days"]);
  const before = new Date(Date.now() - days * 86_400_000);
  return withActor(actor, async (tx) => {
    const rows = await tx
      .delete(notifications)
      .where(lt(notifications.updatedAt, before))
      .returning({ id: notifications.id });
    await tx.delete(emailOutbox).where(and(lt(emailOutbox.createdAt, before), inArray(emailOutbox.status, ["sent", "skipped", "failed"])));
    return rows.length;
  });
}

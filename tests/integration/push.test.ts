import { eq, sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { getAuth } from "@/server/auth/auth";
import { systemActor } from "@/server/authz/actor";
import { db } from "@/server/db/client";
import { notifications, pushOutbox, pushSubscriptions } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { loadSessionUser, signIn, signOut } from "@/server/services/auth";
import { markAllRead, notify } from "@/server/services/notifications";
import { isSubscribed, subscribePush, unsubscribePush } from "@/server/services/push";
import { dispatchPush, type PushSender } from "@/server/services/push/dispatch";
import { setSetting } from "@/server/services/settings";
import { owner } from "../support/db";
import { cookieHeader, createTestUser, meta, TEST_PASSWORD } from "../support/factories";

// Abonelik için genel anahtar tanımlı olmalı (testte gerçek gönderim yok; sahte gönderici kullanılır)
vi.hoisted(() => {
  process.env.VAPID_PUBLIC_KEY ||= `B${"A".repeat(86)}`;
});

const KEYS = { p256dh: `B${"x".repeat(86)}`, auth: "a".repeat(22) };
let seq = 0;
const endpoint = () => `https://fcm.googleapis.com/fcm/send/test-${++seq}`;

async function session(sicilNo: string, sharedDevice = false) {
  const r = await signIn({ sicilNo, password: TEST_PASSWORD, sharedDevice }, meta());
  if (!r.ok) throw new Error("giriş başarısız");
  const cookie = cookieHeader(r.setCookieHeaders);
  const s = await getAuth().api.getSession({ headers: new Headers({ cookie }), query: { disableRefresh: true } });
  return { user: (await loadSessionUser(s!.session.id))!, cookie };
}

async function subscribed(opts: Parameters<typeof createTestUser>[0] = {}) {
  const u = await createTestUser(opts);
  const { user, cookie } = await session(u.sicilNo);
  const ep = endpoint();
  await subscribePush(user, { endpoint: ep, keys: KEYS }, "Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36");
  return { ...u, user, cookie, endpoint: ep };
}

function fire(userId: string, subjectKey = "s1", kind: "readiness_pending" | "exam_result" = "readiness_pending") {
  return withActor(systemActor("test"), (tx) => notify(tx, { kind, userIds: [userId], subjectKey, link: "/manage/readiness" }));
}

/** Sahte gönderici: çağrıları kaydeder, sırayla verilen durum kodlarını döner. */
function sender(...statuses: (number | null)[]) {
  const calls: { endpoint: string; payload: string; ttl: number }[] = [];
  const send: PushSender = async (target, payload, ttl) => {
    calls.push({ endpoint: target.endpoint, payload, ttl });
    return statuses.length > 1 ? statuses.shift()! : statuses.length ? statuses[0]! : 201;
  };
  return { send, calls };
}

const outbox = () => db().select().from(pushOutbox);
const subsOf = (userId: string) => db().select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));

describe("SPEC 10.2 web push (iş paketi 2.6)", () => {
  it("karar #176, #179: abone kişiye push yalnızca bildirim kimliği ve genel metinle gider; kısa tarayıcı bilgisi saklanır", async () => {
    const u = await subscribed();
    await fire(u.userId);
    const [n] = await db().select().from(notifications).where(eq(notifications.userId, u.userId));
    expect(await outbox()).toEqual([expect.objectContaining({ notificationId: n!.id, userId: u.userId, status: "pending" })]);

    const s = sender(201);
    expect(await dispatchPush(s.send)).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(s.calls).toHaveLength(1);
    expect(JSON.parse(s.calls[0]!.payload)).toEqual({ id: n!.id, title: "JAPAR Akademi", body: "Yeni bildiriminiz var" });
    expect(s.calls[0]!.ttl).toBe(24 * 3600);
    expect((await outbox())[0]).toMatchObject({ status: "sent", attempts: 1 });
    const [sub] = await subsOf(u.userId);
    expect(sub).toMatchObject({ userAgent: "Chrome · Android", failureCount: 0 });
    expect(sub!.lastSuccessAt).not.toBeNull();
    expect(await isSubscribed(u.actor, u.endpoint)).toBe(true);
  });

  it("karar #179–180, #182: listede olmayan tür, abone olmayan kişi ve aktif olmayan personel için push yazılmaz", async () => {
    const admin = await createTestUser({ roles: ["sysadmin"] });
    const a = await subscribed();
    const plain = await createTestUser();
    await setSetting(admin.actor, "notify.push_events", ["readiness_pending"]);
    await fire(a.userId, "x", "exam_result");
    await fire(plain.userId);
    expect(await outbox()).toEqual([]);

    await owner()`update personnel set status = 'terminated', end_date = '2026-01-01' where user_id = ${a.userId}`;
    await fire(a.userId, "y");
    expect(await outbox()).toEqual([]);
  });

  it("karar #179: tazelenen bildirim ikinci push açmaz; gönderimden önce okunan bildirime push gitmez", async () => {
    const u = await subscribed();
    await fire(u.userId);
    await fire(u.userId);
    expect(await outbox()).toHaveLength(1);

    await markAllRead(u.actor);
    const s = sender(201);
    expect(await dispatchPush(s.send)).toEqual({ sent: 0, skipped: 1, failed: 0 });
    expect(s.calls).toEqual([]);
  });

  it("karar #179: abonelik artık yoksa (410) silinir; geçici hatada yeniden denenir, sınırda bırakılır; hatalı istek hemen bırakılır", async () => {
    const gone = await subscribed();
    await fire(gone.userId);
    expect(await dispatchPush(sender(410).send)).toMatchObject({ skipped: 1 });
    expect(await subsOf(gone.userId)).toEqual([]);

    await owner()`delete from push_outbox`;
    const flaky = await subscribed();
    await fire(flaky.userId);
    await dispatchPush(sender(503).send);
    let [row] = await outbox();
    expect(row).toMatchObject({ status: "pending", attempts: 1 });
    expect(row!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 30_000);
    for (let i = 0; i < 2; i++) {
      await owner()`update push_outbox set next_attempt_at = now() - interval '1 second'`;
      await dispatchPush(sender(null).send);
    }
    [row] = await outbox();
    expect(row).toMatchObject({ status: "failed", attempts: 3 });
    expect((await subsOf(flaky.userId))[0]!.failureCount).toBe(3);

    await owner()`delete from push_outbox`;
    await fire(flaky.userId, "other");
    expect(await dispatchPush(sender(400).send)).toMatchObject({ failed: 1 });
  });

  it("karar #178: ortak cihaz oturumunda abonelik reddedilir; çıkış yapınca bu cihazın aboneliği silinir", async () => {
    const u = await createTestUser();
    const shared = await session(u.sicilNo, true);
    await expect(subscribePush(shared.user, { endpoint: endpoint(), keys: KEYS }, null)).rejects.toMatchObject({ code: "shared_device" });

    const s = await subscribed();
    await signOut(meta({ cookie: s.cookie }));
    expect(await subsOf(s.userId)).toEqual([]);
  });

  it("aynı tarayıcıda başka kişi abone olursa adres yeni kişiye geçer; kapatma yalnızca kendi kaydını siler; bilinmeyen servis reddedilir", async () => {
    const a = await subscribed();
    const b = await createTestUser();
    const bs = await session(b.sicilNo);
    await subscribePush(bs.user, { endpoint: a.endpoint, keys: KEYS }, null);
    expect(await subsOf(a.userId)).toEqual([]);
    expect(await isSubscribed(b.actor, a.endpoint)).toBe(true);

    await unsubscribePush(a.actor, a.endpoint);
    expect(await isSubscribed(b.actor, a.endpoint)).toBe(true);
    await unsubscribePush(b.actor, a.endpoint);
    expect(await subsOf(b.userId)).toEqual([]);

    await expect(subscribePush(bs.user, { endpoint: "https://169.254.169.254/latest", keys: KEYS }, null)).rejects.toMatchObject({ code: "push_endpoint" });
  });

  it("karar #182: kişi anonimleştirilince abonelikleri silinir; denetim kaydında adres ve anahtarlar maskelidir", async () => {
    const u = await subscribed();
    const [audit] = await owner()<{ new_data: Record<string, unknown> }[]>`select new_data from audit_log where table_name = 'push_subscriptions' and action = 'INSERT'`;
    expect(audit!.new_data.endpoint).not.toBe(u.endpoint);
    expect(audit!.new_data.auth).not.toBe(KEYS.auth);

    await owner()`update personnel set status = 'terminated', end_date = '2000-01-01' where user_id = ${u.userId}`;
    await db().execute(sql`select app_anonymize_people(array[${u.userId}]::uuid[])`);
    expect(await subsOf(u.userId)).toEqual([]);
  });
});

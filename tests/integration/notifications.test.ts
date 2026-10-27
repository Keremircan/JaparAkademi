import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { emailOutbox, notifications, sessions } from "@/server/db/schema";
import { myLearning, updateAssignment } from "@/server/services/assignments";
import { acknowledgeItem, learnModule, reportReachedEnd } from "@/server/services/assignments/learner";
import { signIn } from "@/server/services/auth";
import { createContent, saveDraft, submitForApproval, approveVersion } from "@/server/services/content";
import { answerExam, getAttempt, startExam, submitExam } from "@/server/services/exams";
import { createModule, setModuleContents, saveTasks } from "@/server/services/modules";
import { dispatchEmails } from "@/server/services/notifications/dispatch";
import { markAllRead, myNotifications, openNotification, unreadCount } from "@/server/services/notifications";
import { isResetTokenValid, requestPasswordReset, resetPasswordWithToken } from "@/server/services/password-reset";
import { markTask, practiceModule } from "@/server/services/practice";
import { createQuestion } from "@/server/services/questions";
import { owner } from "../support/db";
import { seedContentPeople, textBody } from "../support/content";
import { createTestUser, meta, TEST_PASSWORD } from "../support/factories";
import { moduleInput, publishCard, publishedText } from "../support/training";

type People = Awaited<ReturnType<typeof seedContentPeople>>;
type Trainee = Awaited<ReturnType<typeof createTestUser>>;

const kinds = async (userId: string) =>
  (await db().select({ kind: notifications.kind }).from(notifications).where(eq(notifications.userId, userId))).map((r) => r.kind).sort();

async function setEmail(userId: string, email: string) {
  await owner()`update personnel set email = ${email} where user_id = ${userId}`;
}

/** Pres: teorik modül + teorik sınav (gözetmensiz, 1 hak) + pratik modül ve pratik sınav. */
async function setup(p: People) {
  const sm = p.smUretim.actor;
  const c = await publishedText(sm, p.org.units.pres, "Pres temelleri", "metin");
  const theory = (await createModule(sm, moduleInput(p.org.units.pres, "theory", "Pres teorisi"))).id;
  await setModuleContents(sm, theory, [c]);
  const exam = (await createModule(sm, moduleInput(p.org.units.pres, "theory_exam", "Pres sınavı"))).id;
  for (let i = 0; i < 4; i++) {
    await createQuestion(sm, {
      type: "single_choice", stem: `Sınav sorusu ${i}`, options: ["Doğru şık", "Yanlış bir", "Yanlış iki"], correctIndex: 0, explanation: null,
      topic: "Pres", difficulty: 1, isOhsCritical: false, mediaAssetId: null, moduleIds: [theory], ownerOrgUnitId: p.org.units.pres, isOhs: false,
    });
  }
  const { cardModuleId } = await publishCard(p, p.org.positions.presOp, [theory, exam], sm, {
    [exam]: { questionCount: 4, passScore: 75, maxAttempts: 1, cooldownHours: 0, durationMin: 10, proctorRequired: false },
  });
  return { theory, exam, cardModuleId };
}

async function finish(u: Trainee, moduleId: string) {
  const am = (await myLearning(u.actor)).current!.modules.find((m) => m.moduleId === moduleId)!;
  for (const item of (await learnModule(u.actor, am.id)).items) {
    await reportReachedEnd(u.actor, item.id);
    await acknowledgeItem(u.actor, item.id);
  }
}

async function takeExam(u: Trainee, examModuleId: string, pass: boolean) {
  const am = (await myLearning(u.actor)).current!.modules.find((m) => m.moduleId === examModuleId)!;
  const { attemptId } = await startExam(u.actor, am.id, { code: null, ip: null, userAgent: null });
  const view = await getAttempt(u.actor, attemptId);
  if (view.state !== "open") throw new Error("açık değil");
  for (const item of view.questions) {
    const right = item.options.indexOf("Doğru şık");
    await answerExam(u.actor, attemptId, item.itemId, pass ? right : (right + 1) % item.options.length);
  }
  await submitExam(u.actor, attemptId);
}

describe("SPEC 10.2 bildirimler", () => {
  it("kursiyer: eğitim açıldı, sınav açıldı, sınav sonucu; bölüm sorumlusu: işe başlama onayı bekleyen (kapsam dışı ve kursiyer almaz)", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    await setEmail(p.smUretim.userId, "sorumlu@example.com");
    const u = await createTestUser({ positionId: p.org.positions.presOp, trainingRequired: true });
    expect(await kinds(u.userId)).toEqual(["assignment_started"]);
    await finish(u, s.cardModuleId);
    await finish(u, s.theory);
    expect(await kinds(u.userId)).toEqual(["assignment_started", "exam_available"]);
    await takeExam(u, s.exam, true);
    expect(await kinds(u.userId)).toEqual(["assignment_started", "exam_available", "exam_result"]);

    expect(await kinds(p.smUretim.userId)).toEqual(["readiness_pending"]);
    expect(await kinds(p.smKalite.userId)).toEqual([]);
    const [n] = await db().select().from(notifications).where(eq(notifications.userId, p.smUretim.userId));
    expect(n).toMatchObject({ link: `/manage/readiness/${(await myLearning(u.actor)).current!.id}`, params: { name: expect.any(String) } });

    // E-posta: yalnızca e-postası olan kişiye, genel başlık + bağlantı (kişisel ayrıntı yok — karar #86)
    const mails = await db().select().from(emailOutbox);
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ toAddress: "sorumlu@example.com", kind: "readiness_pending", status: "pending" });
    expect(mails[0]!.bodyText).not.toContain(n!.params.name as string);
    expect(mails[0]!.bodyText).toContain("/manage/readiness/");
  });

  it("karar #90: aynı konu için okunmamış tek bildirim; okununca yeni olay yeni bildirim açar; başkasının bildirimi açılamaz", async () => {
    const p = await seedContentPeople();
    await setup(p);
    const u = await createTestUser({ positionId: p.org.positions.presOp, trainingRequired: true });
    const a = (await myLearning(u.actor)).current!;
    await setEmail(p.trainerPres.userId, "egitmen@example.com");
    await updateAssignment(p.hr.actor, a.id, { trainerUserId: p.trainerPres.userId, targetDate: null });
    await updateAssignment(p.hr.actor, a.id, { trainerUserId: p.trainerPres.userId, targetDate: "2030-01-01" });
    expect(await kinds(p.trainerPres.userId)).toEqual(["trainee_assigned"]);
    expect(await unreadCount(p.trainerPres.actor)).toBe(1);

    const { items } = await myNotifications(p.trainerPres.actor);
    await expect(openNotification(u.actor, items[0]!.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await openNotification(p.trainerPres.actor, items[0]!.id)).toEqual({ link: "/trainer" });
    expect(await unreadCount(p.trainerPres.actor)).toBe(0);

    // Eğitmen değişip geri gelince yeni bildirim (öncekisi okundu)
    await updateAssignment(p.hr.actor, a.id, { trainerUserId: null, targetDate: null });
    await updateAssignment(p.hr.actor, a.id, { trainerUserId: p.trainerPres.userId, targetDate: null });
    expect(await kinds(p.trainerPres.userId)).toEqual(["trainee_assigned", "trainee_assigned"]);
    expect((await db().select().from(emailOutbox).where(eq(emailOutbox.toAddress, "egitmen@example.com"))).length).toBe(2);
    await markAllRead(p.trainerPres.actor);
    expect(await unreadCount(p.trainerPres.actor)).toBe(0);
  });

  it("onay bekleyen içerik: birim içeriği kapsamdaki sorumluya, İSG adımı İSG uzmanına; gönderen almaz", async () => {
    const p = await seedContentPeople();
    const { id } = await createContent(p.trainerPres.actor, { type: "text", title: "Kalıp değişimi", ownerOrgUnitId: p.org.units.pres, commonTarget: null, isOhs: true });
    await saveDraft(p.trainerPres.actor, id, { title: "Kalıp değişimi", body: textBody("Adımlar"), tagIds: [] });
    await submitForApproval(p.trainerPres.actor, id, { changeNote: null, requireReread: false });
    expect(await kinds(p.smUretim.userId)).toEqual(["approval_pending"]);
    expect(await kinds(p.ohs.userId)).toEqual([]);
    expect(await kinds(p.trainerPres.userId)).toEqual([]);
    const [pending] = await db().select().from(notifications).where(eq(notifications.userId, p.smUretim.userId));
    expect(pending).toMatchObject({ link: "/manage/approvals", params: { type: "content", title: "Kalıp değişimi" } });

    const { approvalQueue } = await import("@/server/services/content");
    const [q] = await approvalQueue(p.smUretim.actor);
    await approveVersion(p.smUretim.actor, q!.versionId);
    expect(await kinds(p.ohs.userId)).toEqual(["approval_pending"]);
    // Konu kapanınca bekleyen bildirim okundu sayılır (başkasının tamamladığı iş bekliyor görünmez)
    expect(await unreadCount(p.smUretim.actor)).toBe(0);
    expect(await unreadCount(p.ohs.actor)).toBe(1);
  });

  it("tüm haklarda başarısız: İK ve kapsamdaki sorumlu; kursiyer ve eğitmen almaz", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    const u = await createTestUser({ positionId: p.org.positions.presOp, trainingRequired: true });
    await finish(u, s.cardModuleId);
    await finish(u, s.theory);
    await takeExam(u, s.exam, false);
    expect(await kinds(p.hr.userId)).toContain("all_attempts_failed");
    expect(await kinds(p.smUretim.userId)).toEqual(["all_attempts_failed"]);
    expect(await kinds(p.smKalite.userId)).toEqual([]);
    // Kalınan sınav İSG modülü değil: İSG uzmanı bu olayı almaz (kart onayı bildirimi ayrı)
    expect(await kinds(p.ohs.userId)).not.toContain("all_attempts_failed");
    expect(await kinds(u.userId)).not.toContain("all_attempts_failed");
  });

  it("pratik: eğitmen 'pratik sınav açıldı' alır", async () => {
    const p = await seedContentPeople();
    const sm = p.smUretim.actor;
    const practice = (await createModule(sm, moduleInput(p.org.units.pres, "practice", "Pres pratiği"))).id;
    await saveTasks(sm, practice, [{ title: "Görev", description: null, isCritical: false }]);
    const pexam = (await createModule(sm, moduleInput(p.org.units.pres, "practice_exam", "Pres pratik sınavı"))).id;
    const { cardModuleId } = await publishCard(p, p.org.positions.presOp, [practice, pexam]);
    const u = await createTestUser({ positionId: p.org.positions.presOp, trainingRequired: true });
    await finish(u, cardModuleId);
    await updateAssignment(p.hr.actor, (await myLearning(u.actor)).current!.id, { trainerUserId: p.trainerPres.userId, targetDate: null });
    const am = (await myLearning(u.actor)).current!.modules.find((m) => m.moduleId === practice)!;
    const id = (await practiceModule(p.trainerPres.actor, am.id)).tasks[0]!.taskId;
    for (const level of ["demonstrated", "supervised", "independent"] as const) await markTask(p.trainerPres.actor, am.id, id, { level, note: null, photoAssetIds: [] });
    expect(await kinds(p.trainerPres.userId)).toEqual(["practical_exam_available", "trainee_assigned"]);
  });
});

describe("e-posta kuyruğu (karar #87)", () => {
  it("log sürücüsüyle gönderilmiş sayılır", async () => {
    const p = await seedContentPeople();
    await setup(p);
    await setEmail(p.smUretim.userId, "sorumlu@example.com");
    await owner()`insert into email_outbox (id, kind, to_address, subject, body_text, body_html) values (gen_random_uuid(), 'readiness_pending', 'a@example.com', 'Konu', 'metin', '<p>metin</p>')`;
    const r = await dispatchEmails();
    expect(r.sent).toBeGreaterThanOrEqual(1);
    const rows = await db().select().from(emailOutbox).where(eq(emailOutbox.toAddress, "a@example.com"));
    expect(rows[0]).toMatchObject({ status: "sent", attempts: 1 });
  });
});

describe("SPEC 11.4 e-postayla şifre sıfırlama (karar #88)", () => {
  it("e-postası olan kişiye tek kullanımlık bağlantı; yeni şifreyle giriş; oturumlar kapanır; sicil sızdırılmaz", async () => {
    const u = await createTestUser({});
    await setEmail(u.userId, "kisi@example.com");
    const before = await signIn({ sicilNo: u.sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta());
    expect(before.ok).toBe(true);

    await requestPasswordReset({ sicilNo: "OLMAYAN-SICIL", ip: "10.1.1.1" });
    await requestPasswordReset({ sicilNo: u.sicilNo, ip: "10.1.1.1" });
    const mails = await db().select().from(emailOutbox).where(eq(emailOutbox.kind, "password_reset"));
    expect(mails).toHaveLength(1);
    const token = /reset-password\/([A-Za-z0-9_-]{43})/.exec(mails[0]!.bodyText)![1]!;
    expect(await isResetTokenValid(token)).toBe(true);
    expect(await isResetTokenValid("x".repeat(43))).toBe(false);

    await expect(resetPasswordWithToken({ token, newPassword: "123" })).rejects.toMatchObject({ code: "weak_password" });
    await resetPasswordWithToken({ token, newPassword: "Yeni.Sifre-2026" });
    expect(await db().select().from(sessions).where(eq(sessions.userId, u.userId))).toHaveLength(0);
    await expect(resetPasswordWithToken({ token, newPassword: "Baska.Sifre-2026" })).rejects.toMatchObject({ code: "reset_link_invalid" });
    expect((await signIn({ sicilNo: u.sicilNo, password: "Yeni.Sifre-2026", sharedDevice: false }, meta())).ok).toBe(true);
    expect((await signIn({ sicilNo: u.sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta())).ok).toBe(false);
  });

  it("e-postası olmayan kişiye ve saatlik sınırın üstünde bağlantı gitmez; süresi dolan bağlantı geçersiz", async () => {
    const noMail = await createTestUser({});
    await requestPasswordReset({ sicilNo: noMail.sicilNo, ip: null });
    const u = await createTestUser({});
    await setEmail(u.userId, "kisi@example.com");
    for (let i = 0; i < 5; i++) await requestPasswordReset({ sicilNo: u.sicilNo, ip: null });
    const rows = await db().select().from(emailOutbox).where(eq(emailOutbox.kind, "password_reset"));
    expect(rows).toHaveLength(3);
    const token = /reset-password\/([A-Za-z0-9_-]{43})/.exec(rows[0]!.bodyText)![1]!;
    await owner()`update password_reset_tokens set expires_at = now() - interval '1 minute'`;
    expect(await isResetTokenValid(token)).toBe(false);
  });
});

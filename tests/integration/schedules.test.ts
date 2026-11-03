import { and, eq, isNull } from "drizzle-orm";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { todayIn } from "@/lib/dates";
import type { ScheduleInput, ScheduleItem, Weekday } from "@/lib/schedules";
import { systemActor } from "@/server/authz/actor";
import { db } from "@/server/db/client";
import { notifications, personalSchedules, scheduleChoices } from "@/server/db/schema";
import { updatePerson } from "@/server/services/people";
import { exportPersonalData } from "@/server/services/personal-export";
import { runRetention } from "@/server/services/retention";
import {
  chooseWorkSchedule,
  deleteWorkSchedule,
  getWorkSchedule,
  keepMyScheduleCopy,
  mySchedule,
  myTodayFlow,
  positionSchedules,
  revertMyScheduleCopy,
  saveMyScheduleCopy,
  saveWorkSchedule,
  scheduleOverview,
} from "@/server/services/schedules";
import { subtractYears } from "@/server/state/retention";
import { owner } from "../support/db";
import { createTestUser } from "../support/factories";
import { seedTestOrg } from "../support/org";

const item = (time: string, title: string, weekday: Weekday | null = null, note: string | null = null): ScheduleItem => ({ weekday, time, title, note });
const daily = (name: string, items: ScheduleItem[] = [item("08:00", "Vardiya başı kontrol")]): ScheduleInput => ({
  name,
  kind: "daily",
  days: [1, 2, 3, 4, 5],
  startTime: "00:00",
  items,
});

async function setup() {
  const org = await seedTestOrg();
  const hr = await createTestUser({ roles: ["hr"] });
  const a = await createTestUser({ positionId: org.positions.presOp });
  const b = await createTestUser({ positionId: org.positions.presOp });
  return { org, hr, a, b };
}

const unread = (userId: string, kind: string) =>
  db()
    .select({ subjectKey: notifications.subjectKey, params: notifications.params, link: notifications.link })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.kind, kind), isNull(notifications.readAt)));

const choiceOf = (userId: string) => db().select().from(scheduleChoices).where(eq(scheduleChoices.userId, userId));
const copiesOf = (userId: string) => db().select().from(personalSchedules).where(eq(personalSchedules.userId, userId));

describe("Çalışma programı (iş paketi 3.9, kararlar #251–257)", () => {
  it("FG-1.7 programı İK ve üst yönetici hazırlar; diğer roller hazırlayamaz ve yönetim listesini göremez (karar #251)", async () => {
    const { org, hr } = await setup();
    const boss = await createTestUser({ roles: ["owner"] });
    const others = await Promise.all(
      (["section_manager", "trainer", "ohs_specialist", "sysadmin", "security"] as const).map((role) => createTestUser({ roles: [role] })),
    );
    for (const who of [...others, await createTestUser()]) {
      await expect(saveWorkSchedule(who.actor, org.positions.presOp, null, daily("Genel"))).rejects.toMatchObject({ code: "forbidden" });
      await expect(scheduleOverview(who.actor)).rejects.toMatchObject({ code: "forbidden" });
      await expect(positionSchedules(who.actor, org.positions.presOp)).rejects.toMatchObject({ code: "forbidden" });
    }
    const day = await saveWorkSchedule(hr.actor, org.positions.presOp, null, daily("Gündüz"));
    await saveWorkSchedule(boss.actor, org.positions.presOp, null, { ...daily("Gece"), startTime: "22:00" });
    await expect(saveWorkSchedule(hr.actor, org.positions.presOp, null, daily("Gündüz"))).rejects.toMatchObject({ code: "schedule_name_taken" });
    await saveWorkSchedule(hr.actor, org.positions.kkTek, null, daily("Gündüz"));
    await expect(saveWorkSchedule(hr.actor, org.positions.presOp, null, { ...daily("X"), days: [] })).rejects.toMatchObject({ code: "schedule_days_required" });
    await expect(saveWorkSchedule(hr.actor, org.positions.presOp, null, { ...daily("Y"), kind: "weekly" })).rejects.toMatchObject({ code: "schedule_weekday_required" });

    const row = (await scheduleOverview(hr.actor)).find((r) => r.positionId === org.positions.presOp);
    expect(row).toMatchObject({ positionName: "Pres Operatörü", unitName: "Pres Hattı", people: 2 });
    expect(row!.programs.map((p) => p.name)).toEqual(["Gündüz", "Gece"]);
    expect(await getWorkSchedule(hr.actor, day.id)).toMatchObject({ version: 1, days: [1, 2, 3, 4, 5], items: [item("08:00", "Vardiya başı kontrol")] });
  });

  it("FG-1.7 tek program herkese; birden çoksa kişi vardiyasını seçer ve değiştirir; başka pozisyonun programı seçilemez (karar #252)", async () => {
    const { org, hr, a } = await setup();
    expect(await mySchedule(a.actor)).toMatchObject({ positionName: "Pres Operatörü", programs: [], needsChoice: false, current: null });
    expect(await myTodayFlow(a.actor)).toEqual({ state: "none" });

    const day = await saveWorkSchedule(hr.actor, org.positions.presOp, null, daily("Gündüz"));
    expect((await mySchedule(a.actor)).current).toMatchObject({ id: day.id, state: "follows", copyItems: null });

    const night = await saveWorkSchedule(hr.actor, org.positions.presOp, null, {
      name: "Gece",
      kind: "daily",
      days: [1, 2, 3, 4, 5],
      startTime: "22:00",
      items: [item("06:00", "Çıkış"), item("22:00", "Devir")],
    });
    expect(await mySchedule(a.actor)).toMatchObject({ needsChoice: true, current: null });
    expect(await myTodayFlow(a.actor)).toMatchObject({ state: "choose", programs: [{ id: day.id }, { id: night.id }] });

    const other = await saveWorkSchedule(hr.actor, org.positions.kkTek, null, daily("Kalite"));
    await expect(chooseWorkSchedule(a.actor, other.id)).rejects.toMatchObject({ code: "not_found" });
    await chooseWorkSchedule(a.actor, night.id);
    expect((await mySchedule(a.actor)).current).toMatchObject({ id: night.id, name: "Gece" });
    // Salı 03:00 (İstanbul): Pazartesi akşamı başlayan vardiya sürüyor
    expect(await myTodayFlow(a.actor, new Date("2026-11-03T00:00:00Z"))).toMatchObject({
      state: "flow",
      name: "Gece",
      multiple: true,
      own: false,
      startTime: "22:00",
      flow: { date: "2026-11-02", fromYesterday: true, current: 0 },
    });

    await chooseWorkSchedule(a.actor, day.id);
    expect((await choiceOf(a.userId)).map((c) => c.scheduleId)).toEqual([day.id]);

    const nobody = await createTestUser();
    expect(await mySchedule(nobody.actor)).toMatchObject({ positionName: null, programs: [], current: null });
    expect(await myTodayFlow(nobody.actor)).toEqual({ state: "none" });
  });

  it("FG-1.7 kişi programını kendine göre değiştirir; aynıysa saklanmaz; İK kimin neyi değiştirdiğini görür, denetim kaydında maskeli (kararlar #253, #255, #257)", async () => {
    const { org, hr, a } = await setup();
    const p = await saveWorkSchedule(hr.actor, org.positions.presOp, null, daily("Genel", [item("08:00", "Vardiya başı kontrol"), item("12:00", "Öğle arası")]));
    // Sırası farklı ama aynı program: kopya saklanmaz
    await saveMyScheduleCopy(a.actor, p.id, [item("12:00", "Öğle arası"), item("08:00", "Vardiya başı kontrol")]);
    expect(await copiesOf(a.userId)).toEqual([]);

    const mine = [item("08:00", "Vardiya başı kontrol"), item("12:30", "Öğle arası", null, "Yemekhane 2")];
    await saveMyScheduleCopy(a.actor, p.id, [mine[1]!, mine[0]!]);
    expect((await mySchedule(a.actor)).current).toMatchObject({ state: "own", copyItems: mine, effective: { items: mine } });
    expect(await myTodayFlow(a.actor)).toMatchObject({ state: "flow", own: true });

    const other = await saveWorkSchedule(hr.actor, org.positions.kkTek, null, daily("Kalite"));
    await expect(saveMyScheduleCopy(a.actor, other.id, [item("09:00", "X")])).rejects.toMatchObject({ code: "not_found" });

    const view = await positionSchedules(hr.actor, org.positions.presOp);
    expect(view.position).toMatchObject({ name: "Pres Operatörü", people: 2 });
    expect(view.programs[0]!.copies).toEqual([expect.objectContaining({ userId: a.userId, sicilNo: a.sicilNo, state: "own", items: mine })]);
    expect((await scheduleOverview(hr.actor)).find((r) => r.positionId === org.positions.presOp)!.programs[0]).toMatchObject({ copies: 1 });

    const audit = await owner()<{ new_data: Record<string, unknown> }[]>`select new_data from audit_log where table_name = 'personal_schedules' and action = 'INSERT'`;
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0]!.new_data)).not.toContain("Yemekhane");

    await revertMyScheduleCopy(a.actor, p.id);
    expect((await mySchedule(a.actor)).current).toMatchObject({ state: "follows", copyItems: null });
    expect(await copiesOf(a.userId)).toEqual([]);
  });

  it("FG-1.7 program güncellenince yalnızca eski sürüme göre kopyası olanlara bildirim gider; kişi yeni programa geçer ya da kendininkini korur (karar #253)", async () => {
    const { org, hr, a, b } = await setup();
    const c = await createTestUser({ positionId: org.positions.presOp });
    const base = daily("Genel", [item("08:00", "Kontrol")]);
    const p = await saveWorkSchedule(hr.actor, org.positions.presOp, null, base);
    await saveMyScheduleCopy(a.actor, p.id, [item("08:15", "Kontrol")]);
    await saveMyScheduleCopy(b.actor, p.id, [item("07:45", "Kontrol")]);

    // Yalnızca ad değişince sürüm artmaz, bildirim gitmez
    await saveWorkSchedule(hr.actor, org.positions.presOp, p.id, { ...base, name: "Genel program" });
    expect((await getWorkSchedule(hr.actor, p.id)).version).toBe(1);
    expect(await unread(a.userId, "schedule_updated")).toEqual([]);

    const v2 = { ...base, name: "Genel program", items: [item("08:00", "Kontrol"), item("16:00", "Devir")] };
    await saveWorkSchedule(hr.actor, org.positions.presOp, p.id, v2);
    expect((await getWorkSchedule(hr.actor, p.id)).version).toBe(2);
    for (const u of [a, b]) {
      expect(await unread(u.userId, "schedule_updated")).toEqual([{ subjectKey: `schedule:${p.id}:${u.userId}`, params: { name: "Genel program" }, link: "/schedule" }]);
      expect((await mySchedule(u.actor)).current?.state).toBe("decide");
    }
    expect(await unread(c.userId, "schedule_updated")).toEqual([]);
    expect((await mySchedule(c.actor)).current?.state).toBe("follows");
    expect((await positionSchedules(hr.actor, org.positions.presOp)).programs[0]!.copies.map((x) => x.state)).toEqual(["decide", "decide"]);

    // a kendi programını korur; b yeni programa geçer. Birinin kararı diğerinin bildirimini kapatmaz.
    await keepMyScheduleCopy(a.actor, p.id);
    expect(await unread(a.userId, "schedule_updated")).toEqual([]);
    expect(await unread(b.userId, "schedule_updated")).toHaveLength(1);
    expect((await mySchedule(a.actor)).current).toMatchObject({ state: "own", copyItems: [item("08:15", "Kontrol")] });
    await revertMyScheduleCopy(b.actor, p.id);
    expect(await unread(b.userId, "schedule_updated")).toEqual([]);
    expect((await mySchedule(b.actor)).current).toMatchObject({ state: "follows", copyItems: null });
    await expect(keepMyScheduleCopy(b.actor, p.id)).rejects.toMatchObject({ code: "not_found" });

    // Sonraki güncellemede yalnızca kopyası olan a bildirim alır
    await saveWorkSchedule(hr.actor, org.positions.presOp, p.id, { ...v2, startTime: "06:00" });
    expect(await unread(a.userId, "schedule_updated")).toHaveLength(1);
    expect(await unread(b.userId, "schedule_updated")).toEqual([]);
    // Kopyasını düzenleyip kaydeden kişi güncel sürümü kabul etmiş olur
    await saveMyScheduleCopy(a.actor, p.id, [item("08:30", "Kontrol")]);
    expect(await unread(a.userId, "schedule_updated")).toEqual([]);
    expect((await mySchedule(a.actor)).current?.state).toBe("own");
  });

  it("FG-1.7 program türü değişince kopyalar silinir; program kaldırılınca seçimler ve kopyalar silinir, kişilere bildirim gider (karar #252)", async () => {
    const { org, hr, a, b } = await setup();
    const day = await saveWorkSchedule(hr.actor, org.positions.presOp, null, daily("Gündüz"));
    const night = await saveWorkSchedule(hr.actor, org.positions.presOp, null, { ...daily("Gece"), startTime: "22:00" });
    await chooseWorkSchedule(a.actor, night.id);
    await saveMyScheduleCopy(a.actor, night.id, [item("23:00", "Tur")]);
    await chooseWorkSchedule(b.actor, day.id);
    await saveMyScheduleCopy(b.actor, day.id, [item("09:00", "Kontrol")]);

    // Gündüz programı haftalığa çevrilir: b'nin kopyası yeni türe uymadığından silinir
    await saveWorkSchedule(hr.actor, org.positions.presOp, day.id, { name: "Gündüz", kind: "weekly", days: [], startTime: "00:00", items: [item("08:00", "Haftalık toplantı", 1)] });
    expect(await copiesOf(b.userId)).toEqual([]);
    expect(await unread(b.userId, "schedule_updated")).toHaveLength(1);
    expect((await mySchedule(b.actor)).current).toMatchObject({ id: day.id, kind: "weekly", days: [1], state: "follows" });

    await expect(deleteWorkSchedule(a.actor, night.id)).rejects.toMatchObject({ code: "forbidden" });
    await deleteWorkSchedule(hr.actor, night.id);
    expect(await choiceOf(a.userId)).toEqual([]);
    expect(await copiesOf(a.userId)).toEqual([]);
    expect(await unread(a.userId, "schedule_removed")).toEqual([{ subjectKey: `schedule_removed:${a.userId}:${night.id}`, params: { name: "Gece" }, link: "/schedule" }]);
    expect(await unread(b.userId, "schedule_removed")).toEqual([]);
    expect((await choiceOf(b.userId)).map((c) => c.scheduleId)).toEqual([day.id]);

    // Tek program kaldı: a onu izler; seçim yapınca kaldırma bildirimi kapanır
    expect((await mySchedule(a.actor)).current?.id).toBe(day.id);
    await chooseWorkSchedule(a.actor, day.id);
    expect(await unread(a.userId, "schedule_removed")).toEqual([]);
  });

  it("karar #257 pozisyonu değişenin seçimi ve kopyaları silinir; KVKK dışa aktarmada yer alır; anonimleştirmede silinir", async () => {
    const { org, hr, a, b } = await setup();
    const day = await saveWorkSchedule(hr.actor, org.positions.presOp, null, daily("Gündüz"));
    const night = await saveWorkSchedule(hr.actor, org.positions.presOp, null, daily("Gece"));
    await chooseWorkSchedule(a.actor, night.id);
    await saveMyScheduleCopy(a.actor, night.id, [item("08:00", "Vardiya başı kontrol"), item("10:00", "Çay molası", null, "Kantin")]);

    const out = await exportPersonalData(hr.actor, a.userId);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(out.base64, "base64") as unknown as ExcelJS.Buffer);
    const sheet = wb.getWorksheet("Çalışma programım")!;
    expect(sheet.rowCount).toBe(3);
    expect(sheet.getRow(2).values).toEqual([undefined, "Gece", "Evet", "—", "08:00", "Vardiya başı kontrol", "—", expect.any(String)]);
    expect(sheet.getRow(3).getCell(6).value).toBe("Kantin");

    await updatePerson(hr.actor, a.userId, { fullName: "Taşınan Kişi", positionId: org.positions.montajOp, employmentType: "employee", trainingRequired: false });
    expect(await choiceOf(a.userId)).toEqual([]);
    expect(await copiesOf(a.userId)).toEqual([]);
    expect((await mySchedule(a.actor)).programs).toEqual([]);

    await chooseWorkSchedule(b.actor, day.id);
    await saveMyScheduleCopy(b.actor, day.id, [item("09:00", "Kontrol")]);
    await owner()`update personnel set status = 'terminated', end_date = ${subtractYears(todayIn("Europe/Istanbul"), 16)} where user_id = ${b.userId}`;
    const result = await runRetention(systemActor("test:retention"));
    expect(result.anonymized).toBe(1);
    expect(await choiceOf(b.userId)).toEqual([]);
    expect(await copiesOf(b.userId)).toEqual([]);
  });
});

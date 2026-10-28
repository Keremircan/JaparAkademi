import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, db } from "../../src/server/db/client";
import { personnel, visits } from "../../src/server/db/schema";
import { todayIn } from "../../src/lib/dates";
import { createVisit } from "../../src/server/services/visitors";
import { acceptConsentIfAsked, login } from "./helpers";
import { E2E_PASSWORD } from "./global-setup";

const sicil = (kind: string, projectName: string) => `E2E-${process.env.E2E_SUFFIX}-${kind}${projectName[0]}`;

test.afterAll(async () => {
  await closeDb();
});

test("SPEC 8.3 FG-8.1 güvenlik tatbikat yoklaması başlatır, içerideki kişiyi işaretler ve bitirir", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  page.on("dialog", (d) => void d.accept());
  const name = `E2E İçerideki ${testInfo.project.name} ${Date.now()}`;
  // İçeride bir ziyaretçi (kapı akışı ayrı testte; burada doğrudan)
  const [sec] = await db().select({ userId: personnel.userId }).from(personnel).where(eq(personnel.sicilNo, sicil("SEC", testInfo.project.name)));
  const actor = { kind: "user" as const, userId: sec!.userId, roles: ["personnel" as const, "security" as const] };
  const { id } = await createVisit(actor, { visitorType: "office", plannedDate: todayIn("Europe/Istanbul"), fullName: name, hostSicilNo: sicil("HR", testInfo.project.name) });
  await db().update(visits).set({ status: "checked_in", checkedInAt: new Date(), badgeNo: "E2E-EV" }).where(eq(visits.id, id));

  await login(page, sicil("SEC", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);
  await page.goto("/security");
  await page.getByRole("link", { name: /Tahliye yoklaması/ }).click();
  await page.waitForURL(/\/security\/evacuation$/);
  // Önceki çalıştırmadan açık yoklama kaldıysa bitir
  const end = page.getByRole("button", { name: "Yoklamayı bitir" }).filter({ visible: true });
  if (await end.isVisible()) {
    await end.click();
    await expect(end).toHaveCount(0);
  }
  await page.getByRole("button", { name: /Yoklama başlat: Tatbikat/ }).filter({ visible: true }).click();
  await expect(page.getByText(/Açık yoklama: Tatbikat/).filter({ visible: true })).toBeVisible();
  await page.getByRole("button", { name: `Toplanma alanında: ${name}` }).click();
  await expect(page.getByRole("button", { name: `Geri al: ${name}` })).toBeVisible();
  await page.getByRole("button", { name: "Yoklamayı bitir" }).filter({ visible: true }).click();
  await expect(page.getByRole("button", { name: /Yoklama başlat: Tatbikat/ }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText(/Son yoklamalar/).filter({ visible: true })).toBeVisible();

  // Temizlik: kişi çıkmış sayılsın (sonraki çalıştırmalar için)
  await db().update(visits).set({ status: "checked_out", checkedOutAt: new Date(), badgeReturned: true }).where(eq(visits.id, id));
});

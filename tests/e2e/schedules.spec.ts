import { expect, test, type Page } from "@playwright/test";
import { acceptConsentIfAsked, login } from "./helpers";
import { E2E_PASSWORD } from "./global-setup";

const sicil = (kind: string, projectName: string) => `E2E-${process.env.E2E_SUFFIX}-${kind}${projectName[0]}`;

/** Program formunda bir satırı doldurur (satır yoksa "Satır ekle" ile açılır). */
async function fillRow(page: Page, n: number, time: string, title: string) {
  const row = page.getByRole("listitem").filter({ hasText: `${n}. satır` });
  if ((await row.count()) === 0) await page.getByRole("button", { name: "Satır ekle" }).click();
  await row.getByLabel("Saat").fill(time);
  await row.getByLabel("Başlık").fill(title);
}

/** Yeni program: hafta sonu dahil her gün (test hangi gün çalışırsa çalışsın bugünün akışı dolu olsun). */
async function createProgram(page: Page, positionId: string, name: string, startTime: string, rows: [string, string][]) {
  await page.goto(`/manage/schedules/${positionId}/new`);
  await page.getByLabel("Program adı").fill(name);
  await page.getByLabel("Vardiya başlangıcı").fill(startTime);
  for (const day of ["Cumartesi", "Pazar"]) await page.getByRole("checkbox", { name: day, exact: true }).click();
  for (const [i, [time, title]] of rows.entries()) await fillRow(page, i + 1, time, title);
  await page.getByRole("button", { name: "Kaydet" }).click();
  await page.waitForURL(new RegExp(`/manage/schedules/${positionId}$`));
  await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
}

test("FG-1.7 İK vardiya programlarını hazırlar; personel vardiyasını seçer, programını değiştirir; İK değişikliği görür", async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const p = testInfo.project.name[0];
  const contextOptions = testInfo.project.use;
  // Geliştirme veritabanında önceki çalıştırmaların pozisyonları da durur: ad bu çalıştırmaya özgü
  const positionName = `E2E Vardiya Pozisyonu ${process.env.E2E_SUFFIX} ${p}`;

  // 1) İK: Yönetim → Çalışma programları → pozisyon → iki vardiya programı
  const hrCtx = await browser.newContext(contextOptions);
  const hr = await hrCtx.newPage();
  await login(hr, sicil("HR", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(hr);
  await hr.goto("/manage");
  await hr.getByRole("link", { name: /Çalışma programları/ }).click();
  await hr.waitForURL(/\/manage\/schedules$/);
  await hr.getByRole("link", { name: new RegExp(positionName) }).click();
  await hr.waitForURL(/\/manage\/schedules\/[0-9a-f-]{36}$/);
  await expect(hr.getByText("Bu pozisyon için henüz program yok.")).toBeVisible();
  const positionId = hr.url().split("/").pop()!;

  await createProgram(hr, positionId, "Gündüz", "00:00", [
    ["08:00", "Vardiya başı kontrol"],
    ["12:00", "Öğle arası"],
  ]);
  await createProgram(hr, positionId, "Gece", "22:00", [
    ["22:00", "Devir teslim"],
    ["02:00", "Mola"],
  ]);
  await expect(hr.getByText("Birden çok program varsa personel kendi vardiyasını seçer.")).toBeVisible();

  // 2) Personel: ana sayfada vardiyasını seçer, bugünün akışını görür
  const ctx = await browser.newContext(contextOptions);
  const page = await ctx.newPage();
  await login(page, sicil("PRG", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);
  const today = page.locator("section[aria-labelledby='today-flow-heading']");
  await expect(today.getByText("Vardiyanızı seçin")).toBeVisible();
  await today.getByRole("button", { name: "Gündüz seç" }).click();
  await expect(today.getByText("Vardiya başı kontrol")).toBeVisible();
  await expect(today.getByText("Gündüz vardiyası")).toBeVisible();

  // 3) Programım: programı kendine göre değiştirir (İK'nın göreceği söylenir)
  await today.getByRole("link", { name: "Programım" }).click();
  await page.waitForURL(/\/schedule$/);
  await expect(page.getByText("Vardiyanız: Gündüz")).toBeVisible();
  await expect(page.getByText("Pozisyon programı", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Programımı düzenle" }).click();
  await page.waitForURL(/\/schedule\/edit\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Değişikliklerinizi İK görebilir.")).toBeVisible();
  const second = page.getByRole("listitem").filter({ hasText: "2. satır" });
  await second.getByLabel("Başlık").fill("Öğle yemeği");
  await second.getByLabel("Not").fill("Yemekhane 2");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await page.waitForURL(/\/schedule$/);
  await expect(page.getByText("Size özel", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Öğle yemeği").filter({ visible: true }).first()).toBeVisible();

  // 4) İK değiştireni ve değişikliği görür
  await hr.reload();
  const changed = hr.locator("details").filter({ hasText: `Deneme Programım ${p}` });
  await changed.locator("summary").click();
  await expect(changed.getByText(/Öğle yemeği — Yemekhane 2/)).toBeVisible();

  await ctx.close();
  await hrCtx.close();
});

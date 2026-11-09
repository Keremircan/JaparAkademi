import { expect, test } from "@playwright/test";
import { acceptConsentIfAsked, login } from "./helpers";
import { E2E_PASSWORD } from "./global-setup";

const sicil = (kind: string, projectName: string) => `E2E-${process.env.E2E_SUFFIX}-${kind}${projectName[0]}`;

test("SPEC 14 İSG uzmanı tehlike sınıfını Parametreler ekranından değiştirir", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await login(page, sicil("OHS", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);
  await page.goto("/admin");
  await page.getByRole("link", { name: /Parametreler/ }).click();
  await page.waitForURL(/\/admin\/settings$/);
  await expect(page.getByRole("heading", { level: 1, name: "Parametreler" })).toBeVisible();

  // Yalnızca İSG parametreleri görünür
  await expect(page.getByRole("heading", { level: 2, name: "İş sağlığı ve güvenliği" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Sınavlar" })).toHaveCount(0);

  const card = page.locator('[data-setting="ohs.hazard_class"]').filter({ visible: true });
  const select = card.getByLabel("Yeni değer");

  await card.getByRole("button", { name: "Değiştir" }).click();
  const original = await select.inputValue();
  const next = original === "high" ? "medium" : "high";
  const label = next === "high" ? "Çok tehlikeli" : "Tehlikeli";
  await select.selectOption(next);
  await card.getByLabel(/Gerekçe/).fill("E2E deneme");
  await card.getByRole("button", { name: "Kaydet" }).click();
  await expect(card.getByTestId("setting-value")).toHaveText(label);
  await expect(card.getByText("E2E deneme")).toBeVisible();

  // Önceki değere geri al (geliştirme veritabanındaki ayar korunur)
  await card.getByRole("button", { name: "Değiştir" }).click();
  await card.getByLabel("Yeni değer").selectOption(original);
  await card.getByRole("button", { name: "Kaydet" }).click();
  await expect(card.getByRole("button", { name: "Değiştir" })).toBeVisible();
  await expect(card.getByTestId("setting-value")).not.toHaveText(label);
});

test("karar #291: İK Parametreler ekranında yalnızca vardiya türlerini görür", async ({ page }, testInfo) => {
  await login(page, sicil("HR", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);
  await page.goto("/admin");
  await page.getByRole("link", { name: /Parametreler/ }).click();
  await page.waitForURL(/\/admin\/settings$/);
  await expect(page.getByRole("heading", { level: 1, name: "Parametreler" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Kurum" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "İş sağlığı ve güvenliği" })).toHaveCount(0);
  const card = page.locator('[data-setting="org.shift_types"]').filter({ visible: true });
  await expect(card).toBeVisible();
  await expect(card.getByText("Vardiya türleri")).toBeVisible();
  await expect(page.locator("[data-setting]").filter({ visible: true })).toHaveCount(1);
});

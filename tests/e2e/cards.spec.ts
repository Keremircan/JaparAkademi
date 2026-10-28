import { expect, test } from "@playwright/test";
import { acceptConsentIfAsked, login } from "./helpers";
import { E2E_PASSWORD } from "./global-setup";

const sicil = (kind: string, projectName: string) => `E2E-${process.env.E2E_SUFFIX}-${kind}${projectName[0]}`;

test("Bölüm 5 + FG-3.1 plan tasarlanır, kart onaya gider ve İSG uzmanı onayıyla yayınlanır", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const p = testInfo.project.name[0];
  const positionName = `E2E Kart Pozisyonu ${p}`;
  await login(page, sicil("SM", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);

  await page.goto("/manage/positions");
  await page.getByRole("link", { name: new RegExp(positionName) }).click();
  await page.getByRole("button", { name: "Planı düzenle" }).click();
  await expect(page.getByRole("heading", { name: "Planı düzenle" })).toBeVisible();

  await page.getByLabel("Modül ekle").selectOption({ label: `E2E Pratik ${p} (Pratik)` });
  await page.getByRole("button", { name: "Ekle", exact: true }).click();
  await expect(page.getByText(`2. E2E Pratik ${p}`)).toBeVisible();

  // Klavye ile sürükle-bırak: pratik modülü kart modülünün üstüne taşınamaz (kart modülü hep ilk)
  const handle = page.getByRole("button", { name: `E2E Pratik ${p}: sürükleyerek taşı` });
  await handle.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Space");
  await expect(page.getByText(`2. E2E Pratik ${p}`)).toBeVisible();

  await page.getByRole("button", { name: "Planı kaydet" }).click();
  await expect(page.getByText("Kaydedildi.")).toBeVisible();

  await page.getByRole("button", { name: "Kartı düzenle" }).click();
  await page.getByRole("button", { name: "Kaydet ve onaya gönder" }).click();
  await expect(page.getByText("Bu sürüm İSG uzmanı onayı bekliyor.")).toBeVisible();

  await page.goto("/profile");
  await page.getByRole("main").getByRole("button", { name: "Çıkış yap" }).click();
  await login(page, sicil("OHS", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);
  await page.goto("/manage/approvals");
  // Önceki yarıda kalmış çalıştırmaların kartları da listede olabilir: en yeni gönderim sonda
  await page.getByRole("link", { name: new RegExp(positionName) }).last().click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Onayla" }).click();
  await expect(page.getByText("Yayında (s1)").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "13. Eğitim planı" })).toBeVisible();
});

import { expect, test } from "@playwright/test";
import { acceptConsentIfAsked, login } from "./helpers";
import { E2E_PASSWORD } from "./global-setup";

test("kararlar #269–271: hata mesajı Kaydet düğmesinin hemen üstünde çıkar, ekranda değilse görünür alana kayar, yazılanlar silinmez", async ({ page }, testInfo) => {
  const hrSicil = `E2E-${process.env.E2E_SUFFIX}-HR${testInfo.project.name[0]}`;
  await login(page, hrSicil, E2E_PASSWORD);
  await acceptConsentIfAsked(page);

  // Kayıtlı sicil numarasıyla yeni personel: sunucu "sicil_taken" döner
  await page.goto("/admin/people/new");
  await page.getByLabel("Sicil no").fill(hrSicil);
  await page.getByLabel("Ad soyad").fill("Deneme Uyarı Kişisi");
  await page.getByLabel("Pozisyon").selectOption({ label: `${process.env.E2E_DEPARTMENT} / E2E Operatör` });
  await page.getByRole("radio", { name: /Basılı kağıt/ }).check();

  // Sayfa en üstteyken düğmeye kaydırmadan basılır: mesaj ekranın dışında doğar
  const save = page.getByRole("button", { name: "Kaydet" });
  await page.evaluate(() => window.scrollTo(0, 0));
  if (testInfo.project.name === "mobile") await expect(save).not.toBeInViewport();
  await save.dispatchEvent("click");

  const alert = page.getByRole("alert").filter({ hasText: "Bu sicil numarası kayıtlı." });
  await expect(alert).toBeInViewport({ ratio: 1 });
  // Mesajın hemen altındaki öğe Kaydet düğmesidir; o da ekranda kalır
  expect(await alert.evaluate((el) => el.nextElementSibling?.textContent?.trim())).toBe("Kaydet");
  await expect(save).toBeInViewport({ ratio: 1 });

  if (testInfo.project.name === "mobile") {
    // Kaydırma bitince mesaj ve düğme üst çubuğun ve alt menünün arkasında kalmaz
    await expect(async () => {
      const box = (await alert.boundingBox())!;
      const button = (await save.boundingBox())!;
      const nav = (await page.getByRole("navigation", { name: "Ana menü" }).boundingBox())!;
      const header = (await page.locator("header").first().boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(header.y + header.height);
      expect(button.y + button.height).toBeLessThanOrEqual(nav.y);
    }).toPass();
  }

  // Karar #271: hata dönünce yazılanlar silinmez
  await expect(page.getByLabel("Ad soyad")).toHaveValue("Deneme Uyarı Kişisi");
  await expect(page.getByRole("radio", { name: /Basılı kağıt/ })).toBeChecked();
});

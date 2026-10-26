import { expect, test } from "@playwright/test";
import { acceptConsentIfAsked, changePassword, login } from "./helpers";
import { E2E_IMPORT_FILE, E2E_NEW_PASSWORD, E2E_PASSWORD } from "./global-setup";

function hrSicil(projectName: string) {
  return `E2E-${process.env.E2E_SUFFIX}-HR${projectName[0]}`;
}

test("İK personel açar → kişi geçici şifreyle girer, şifresini değiştirir ve KVKK'yı onaylar", async ({ page }, testInfo) => {
  const suffix = process.env.E2E_SUFFIX!;
  const newSicil = `E2E-${suffix}-N${testInfo.project.name[0]}`;

  await login(page, hrSicil(testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);

  await page.goto("/admin/people/new");
  await page.getByLabel("Sicil no").fill(newSicil);
  await page.getByLabel("Ad soyad").fill("Çağrı Şükrü İnce");
  await page.getByLabel("Pozisyon").selectOption({ label: `${process.env.E2E_DEPARTMENT} / E2E Operatör` });
  await page.getByRole("button", { name: "Kaydet" }).click();

  await expect(page.getByRole("heading", { name: "Personel oluşturuldu" })).toBeVisible();
  const tempPassword = (await page.getByTestId("temp-password").textContent())!.trim();
  expect(tempPassword).toMatch(/^\d{8}$/);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Şifre fişini indir (PDF)" }).click();
  expect((await download).suggestedFilename()).toBe(`gecici-sifre-${newSicil}.pdf`);

  await page.goto("/profile");
  await page.getByRole("main").getByRole("button", { name: "Çıkış yap" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await login(page, newSicil, tempPassword);
  await changePassword(page, tempPassword, E2E_NEW_PASSWORD);
  await acceptConsentIfAsked(page);
  await expect(page.getByRole("heading", { name: "Merhaba, Çağrı Şükrü İnce" })).toBeVisible();

  await page.goto("/profile");
  await expect(page.getByText("E2E Operatör")).toBeVisible();
});

test("FG-1.4 İK Excel'den aktarır: önizleme, hatalı satır, onay ve şifre PDF'i", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Aynı dosya iki kez aktarılmasın; masaüstünde çalışır");

  await login(page, hrSicil(testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);

  await page.goto("/admin/people/import");
  await page.getByText("Yeni işe girenler").click();
  await page.getByLabel(/Excel dosyası/).setInputFiles(E2E_IMPORT_FILE);
  await page.getByRole("button", { name: "Yükle ve kontrol et" }).click();

  await expect(page).toHaveURL(/\/admin\/people\/import\/.+/);
  await expect(page.getByText("3 satır: 2 geçerli, 1 hatalı")).toBeVisible();
  await expect(page.getByText("Departman bulunamadı")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Geçerli satırları aktar" }).click();
  expect((await download).suggestedFilename()).toMatch(/^gecici-sifreler-.*\.pdf$/);
  await expect(page.getByRole("heading", { name: "Aktarım tamamlandı" })).toBeVisible();
  await expect(page.getByText("2 yeni hesap, 0 güncellendi, 0 değişmedi.")).toBeVisible();

  await page.goto(`/admin/people?q=${encodeURIComponent(`E2E-${process.env.E2E_SUFFIX}-X`)}`);
  await expect(page.getByText("Aktarılan Bir")).toBeVisible();
  await expect(page.getByText("Aktarılan İki")).toBeVisible();
});

import { expect, test } from "@playwright/test";
import { acceptConsentIfAsked, login } from "./helpers";
import { E2E_IMPORT_FILE, E2E_NEW_PASSWORD, E2E_PASSWORD } from "./global-setup";

function hrSicil(projectName: string) {
  return `E2E-${process.env.E2E_SUFFIX}-HR${projectName[0]}`;
}

test("karar #185–187: İK personel açar (basılı davet) → kişi kodla hesabını etkinleştirir, şifresini belirler ve KVKK'yı onaylar", async ({ page }, testInfo) => {
  const suffix = process.env.E2E_SUFFIX!;
  const newSicil = `E2E-${suffix}-N${testInfo.project.name[0]}`;

  await login(page, hrSicil(testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);

  await page.goto("/admin/people/new");
  await page.getByLabel("Sicil no").fill(newSicil);
  await page.getByLabel("Ad soyad").fill("Çağrı Şükrü İnce");
  await page.getByLabel("Pozisyon").selectOption({ label: `${process.env.E2E_DEPARTMENT} / E2E Operatör` });
  // E-posta gönderimi testte kapalı: seçilemez
  await expect(page.getByRole("radio", { name: /E-posta/ })).toBeDisabled();
  await page.getByRole("radio", { name: /Basılı kağıt/ }).check();
  await page.getByRole("button", { name: "Kaydet" }).click();

  await expect(page.getByRole("heading", { name: "Personel oluşturuldu" })).toBeVisible();
  const code = (await page.getByTestId("invite-code").textContent())!.trim();
  expect(code).toMatch(/^\d{4} \d{4}$/);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Etkinleştirme kağıdını indir (PDF)" }).click();
  expect((await download).suggestedFilename()).toBe(`etkinlestirme-${newSicil}.pdf`);

  await page.goto("/profile");
  await page.getByRole("main").getByRole("button", { name: "Çıkış yap" }).click();
  await expect(page).toHaveURL(/\/login$/);

  // Giriş ekranından "Hesabımı etkinleştir" → sicil + kod → şifre belirleme
  await page.getByRole("button", { name: "Hesabımı etkinleştir" }).click();
  await expect(page).toHaveURL(/\/activate$/);
  await page.getByLabel("Sicil no").fill(newSicil);
  await page.getByLabel("Etkinleştirme kodu").fill(code);
  await page.getByRole("button", { name: "Devam" }).click();
  await expect(page.getByRole("heading", { name: "Hoş geldiniz, Çağrı Şükrü İnce" })).toBeVisible();
  await page.getByLabel("Yeni şifre", { exact: true }).fill(E2E_NEW_PASSWORD);
  await page.getByLabel("Yeni şifre (tekrar)").fill(E2E_NEW_PASSWORD);
  await page.getByRole("button", { name: "Hesabımı etkinleştir" }).click();
  await acceptConsentIfAsked(page);
  await expect(page.getByRole("heading", { name: "Merhaba, Çağrı Şükrü İnce" })).toBeVisible();

  await page.goto("/profile");
  await expect(page.getByText("E2E Operatör")).toBeVisible();

  // Aynı kod ikinci kez kullanılamaz
  await page.getByRole("main").getByRole("button", { name: "Çıkış yap" }).click();
  await page.goto("/activate");
  await page.getByLabel("Sicil no").fill(newSicil);
  await page.getByLabel("Etkinleştirme kodu").fill(code);
  await page.getByRole("button", { name: "Devam" }).click();
  await expect(page.getByText(/Bu bağlantı ya da kod geçersiz/)).toBeVisible();
});

test("FG-1.4 İK Excel'den aktarır: önizleme, hatalı satır, onay ve etkinleştirme kağıtları (karar #185)", async ({ page }, testInfo) => {
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
  expect((await download).suggestedFilename()).toMatch(/^etkinlestirme-kagitlari-.*\.pdf$/);
  await expect(page.getByRole("heading", { name: "Aktarım tamamlandı" })).toBeVisible();
  await expect(page.getByText("2 yeni hesap, 0 güncellendi, 0 değişmedi.")).toBeVisible();

  await page.goto(`/admin/people?q=${encodeURIComponent(`E2E-${process.env.E2E_SUFFIX}-X`)}`);
  await expect(page.getByText("Aktarılan Bir")).toBeVisible();
  await expect(page.getByText("Aktarılan İki")).toBeVisible();
});

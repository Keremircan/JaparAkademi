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

  // Bildirim bölümü durumu belli olunca büyümez; altındaki çıkış düğmesi yerinde kalır (iş paketi 3.8, karar #250)
  await page.goto("/profile");
  const signOut = page.getByRole("main").getByRole("button", { name: "Çıkış yap" });
  await expect(signOut).toBeVisible();
  const before = await signOut.boundingBox();
  await expect(page.getByText(/Bildirim durumu kontrol ediliyor/)).toBeHidden();
  expect(await signOut.boundingBox()).toEqual(before);
  await signOut.click();
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

  // FG-3.7 karar #259: şifresini unutan kişi → İK kişi sayfasından sıfırlar (basılı kod), eski şifre geçersiz olur
  await login(page, hrSicil(testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);
  await page.goto(`/admin/people?q=${encodeURIComponent(newSicil)}`);
  await page.getByRole("link", { name: /Çağrı Şükrü İnce/ }).click();
  await expect(page.getByTestId("account-state")).toHaveText("Etkin");
  await page.getByRole("button", { name: "Şifreyi sıfırla" }).click();
  await page.getByRole("radio", { name: /Basılı kağıt/ }).check();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Bağlantıyı oluştur" }).click();
  await expect(page.getByRole("heading", { name: "Şifre sıfırlandı, yeni şifre bağlantısı hazır" })).toBeVisible();
  const resetCode = (await page.getByTestId("invite-code").textContent())!.trim();
  expect(resetCode).toMatch(/^\d{4} \d{4}$/);
  await page.goto("/profile");
  await page.getByRole("main").getByRole("button", { name: "Çıkış yap" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await login(page, newSicil, E2E_NEW_PASSWORD);
  await expect(page.getByText("Sicil no veya şifre hatalı.")).toBeVisible();

  // Kişi yeni kodla şifresini yeniden belirler
  await page.goto("/activate");
  await page.getByLabel("Sicil no").fill(newSicil);
  await page.getByLabel("Etkinleştirme kodu").fill(resetCode);
  await page.getByRole("button", { name: "Devam" }).click();
  await page.getByLabel("Yeni şifre", { exact: true }).fill(E2E_NEW_PASSWORD);
  await page.getByLabel("Yeni şifre (tekrar)").fill(E2E_NEW_PASSWORD);
  await page.getByRole("button", { name: "Hesabımı etkinleştir" }).click();
  await acceptConsentIfAsked(page);
  await expect(page.getByRole("heading", { name: "Merhaba, Çağrı Şükrü İnce" })).toBeVisible();
});

test("FG-1.4, karar #198–200: İK Excel'den aktarır (davetsiz), sonra Davetler ekranından hepsine basılı davet", async ({ page }, testInfo) => {
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

  await page.getByRole("button", { name: "Geçerli satırları aktar" }).click();
  await expect(page.getByRole("heading", { name: "Aktarım tamamlandı" })).toBeVisible();
  await expect(page.getByText("2 yeni hesap, 0 güncellendi, 0 değişmedi.")).toBeVisible();

  // Aktarılan kişiler davetsiz açıldı → Davetler ekranında yalnızca bu aktarımın kişileri
  await page.getByRole("button", { name: "Bunlara davet gönder" }).click();
  await expect(page).toHaveURL(/\/admin\/people\/invites\?import=/);
  const main = page.getByRole("main").filter({ visible: true });
  await expect(main.getByText("Aktarılan Bir")).toBeVisible();
  await expect(main.getByText("Aktarılan İki")).toBeVisible();
  await main.getByRole("checkbox", { name: "Tümünü seç" }).click();
  await expect(main.getByText("2 kişi seçildi")).toBeVisible();
  await main.getByRole("radio", { name: /Basılı kağıt/ }).check();

  const download = page.waitForEvent("download");
  await main.getByRole("button", { name: "Davet oluştur" }).click();
  expect((await download).suggestedFilename()).toMatch(/^etkinlestirme-kagitlari-.*\.pdf$/);
  await expect(page).toHaveURL(/\/admin\/people\/invites\/[0-9a-f-]{36}\?pdf=1$/);
  await expect(page.getByText("2 kişi: 0 e-posta, 0 WhatsApp, 2 basılı")).toBeVisible();
});

test("karar #201: WhatsApp gönderim listesi — gönderilen satır işaretlenir, liste yeniden açılınca korunur", async ({ page, context }, testInfo) => {
  const sicil = `E2E-${process.env.E2E_SUFFIX}-W${testInfo.project.name[0]}`;
  // Dış servise gidilmez: wa.me isteği kesilir
  await context.route(/wa\.me/, (route) => route.abort());

  await login(page, hrSicil(testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);

  // Varsayılan "Şimdi davet etme" ile eklenir
  await page.goto("/admin/people/new");
  await page.getByLabel("Sicil no").fill(sicil);
  await page.getByLabel("Ad soyad").fill("Whatsapp Deneme");
  await page.locator("#phone").fill("0532 111 22 33");
  await expect(page.getByRole("radio", { name: /Şimdi davet etme/ })).toBeChecked();
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText(/Davet henüz gönderilmedi/)).toBeVisible();

  await page.goto(`/admin/people/invites?q=${encodeURIComponent(sicil)}`);
  const main = page.getByRole("main").filter({ visible: true });
  await main.getByRole("checkbox", { name: new RegExp(sicil) }).click();
  await main.getByRole("radio", { name: /^WhatsApp/ }).check();
  await main.getByRole("button", { name: "Davet oluştur" }).click();
  await expect(page).toHaveURL(/\/admin\/people\/invites\/[0-9a-f-]{36}$/);
  const batchUrl = page.url();

  const list = page.getByRole("main").filter({ visible: true });
  await expect(list.getByText("0 / 1 gönderildi", { exact: true })).toBeVisible();
  const popup = page.waitForEvent("popup");
  await list.getByRole("button", { name: "WhatsApp'ta gönder" }).click();
  await (await popup).close();
  await expect(list.getByText("1 / 1 gönderildi", { exact: true })).toBeVisible();

  // Liste yeniden açılınca işaret korunur
  await page.goto(batchUrl);
  const reopened = page.getByRole("main").filter({ visible: true });
  await expect(reopened.getByText("1 / 1 gönderildi", { exact: true })).toBeVisible();
  await expect(reopened.getByRole("button", { name: "Tekrar aç" })).toBeVisible();
});

test("kararlar #264–267: üst yönetici işten ayrılan kişiyi onay penceresiyle kalıcı olarak siler", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const p = testInfo.project.name[0];
  const suffix = process.env.E2E_SUFFIX!;
  const sicil = `E2E-${suffix}-DEL${p}`;
  const name = `Işıl Silinecek ${p.toUpperCase()}`;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());

  await login(page, `E2E-${suffix}-OWN${p}`, E2E_PASSWORD);
  await acceptConsentIfAsked(page);
  await page.goto(`/admin/people?q=${encodeURIComponent(sicil)}`);
  await page.getByRole("link", { name: new RegExp(name) }).click();
  const main = page.getByRole("main").filter({ visible: true });
  await expect(main.getByRole("heading", { name: "Kişiyi kalıcı olarak sil" })).toBeVisible();

  // Aktif kişi silinemez: önce işten ayrıldı olarak işaretlenir
  await expect(main.getByText(/yalnızca işten ayrılmış kişide yapılabilir/)).toBeVisible();
  await expect(main.getByRole("button", { name: "Kişiyi kalıcı olarak sil" })).toHaveCount(0);
  await main.getByLabel("Ayrılış tarihi").fill(today);
  await main.getByRole("button", { name: "İşten ayrıldı olarak işaretle" }).click();

  // Pencere: uyarı, gerekçe ve "<Ad Soyad> silmeyi onaylıyorum" yazılana kadar silme düğmesi pasif
  await main.getByRole("button", { name: "Kişiyi kalıcı olarak sil" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Kişiyi kalıcı olarak sil" });
  await expect(dialog.getByText("Kişiye ait tüm kişisel veriler silinecektir!", { exact: false })).toBeVisible();
  await expect(dialog.getByText(`${name} silmeyi onaylıyorum`)).toBeVisible();
  const submit = dialog.getByRole("button", { name: "Kalıcı olarak sil" });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel("Silme gerekçesi").fill("KVKK silme talebi, e2e");
  await dialog.getByLabel(/Onaylamak için/).fill("silmeyi onaylıyorum");
  await expect(submit).toBeDisabled();

  // Vazgeç pencereyi kapatır, kişi silinmez; yeniden açınca alanlar boş
  await dialog.getByRole("button", { name: "Vazgeç" }).click();
  await expect(dialog).toBeHidden();
  await main.getByRole("button", { name: "Kişiyi kalıcı olarak sil" }).click();
  await expect(dialog.getByLabel("Silme gerekçesi")).toHaveValue("");

  await dialog.getByLabel("Silme gerekçesi").fill("KVKK silme talebi, e2e");
  // Büyük/küçük harf ve Türkçe I/ı farkı önemsiz
  await dialog.getByLabel(/Onaylamak için/).fill(`ışıl silinecek ${p} silmeyi onaylıyorum`);
  await expect(submit).toBeEnabled();
  await submit.click();

  // Kişi listesine dönülür (iş paketi 3.14, karar #285): anonim kişi hiçbir listede görünmez
  await expect(page).toHaveURL(/\/admin\/people\?deleted=1$/);
  const list = page.getByRole("main").filter({ visible: true });
  await expect(list.getByTestId("person-deleted")).toHaveText("Kişi silindi.");
  await page.goto(`/admin/people?status=all&q=${encodeURIComponent(sicil)}`);
  await expect(page.getByRole("main").filter({ visible: true }).getByText("0 kişi", { exact: true })).toBeVisible();
  await page.goto(`/admin/people?status=all&q=${encodeURIComponent("Anonim")}`);
  await expect(page.getByRole("main").filter({ visible: true }).getByText("0 kişi", { exact: true })).toBeVisible();

  // Silinen kişi giriş yapamaz
  await page.goto("/profile");
  await page.getByRole("main").getByRole("button", { name: "Çıkış yap" }).click();
  await login(page, sicil, E2E_PASSWORD);
  await expect(page.getByText("Sicil no veya şifre hatalı.")).toBeVisible();
});

import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../../src/server/db/client";
import { personnel } from "../../src/server/db/schema";
import { processMediaAsset } from "../../src/server/services/media/process";
import { acceptConsentIfAsked, login } from "./helpers";
import { E2E_PASSWORD } from "./global-setup";

/** Faz 3 ekranları (iş paketi 3.10): yetkinlik, periyodik eğitim, OSGB, yönetim özeti, profil fotoğrafı. */

const suffix = () => process.env.E2E_SUFFIX!;
const sicil = (kind: string, projectName: string) => `E2E-${suffix()}-${kind}${projectName[0]}`;
const main = (page: Page) => page.getByRole("main").filter({ visible: true });

/** Aynı sekmede başka bir kullanıcıyla oturum açar. */
async function switchUser(page: Page, sicilNo: string) {
  await page.context().clearCookies();
  await login(page, sicilNo, E2E_PASSWORD);
  await acceptConsentIfAsked(page);
}

test("FG-7.4 kararlar #218–221: bölüm sorumlusu yetkinlik tanımlar, matristen gerekçeyle verir, Excel iner; kişi profilinde görür", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const p = testInfo.project.name[0];
  const competency = `E2E Pres yetkinliği ${suffix()} ${p}`;
  const person = `Deneme Yetkinlik ${p}`;
  const unit = `E2E Departman ${suffix()} / E2E Hat`;

  await login(page, sicil("SM", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);
  await page.goto("/manage/competencies");
  // Listedeki her kaydın kapalı bir düzenleme formu var: yeni kayıt bölümünde kalınır
  const form = main(page).locator("section[aria-labelledby='new-heading']");
  await form.getByLabel("Ad", { exact: true }).fill(competency);
  await form.getByLabel("Birim", { exact: true }).selectOption({ label: unit });
  await form.getByLabel("Geçerlilik (ay)").fill("12");
  await form.getByRole("button", { name: "Yetkinlik ekle" }).click();
  await expect(main(page).getByText(competency, { exact: true })).toBeVisible();

  // Matris: birim seçilir, kişinin hücresinden gerekçeyle verilir
  await page.goto("/reports/competency");
  await main(page).locator('select[name="unit"]').selectOption({ label: unit });
  await main(page).getByRole("button", { name: "Göster" }).click();
  await page.waitForURL(/unit=/);
  await main(page).getByRole("link", { name: `${person}, ${competency}: Yok` }).click();
  await page.waitForURL(/cell=/);
  await main(page).getByLabel("Verme gerekçesi").fill("Pres makinesini usta gözetiminde güvenle kullandı.");
  await main(page).getByRole("button", { name: "Yetkinlik ver" }).click();
  await expect(main(page).getByRole("link", { name: `${person}, ${competency}: Geçerli` })).toBeVisible();
  await expect(main(page).getByText("Elle verildi").first()).toBeVisible();

  // Matrisin Excel'i sunucu eylemiyle üretilip tarayıcıda indirilir
  const download = page.waitForEvent("download");
  await main(page).getByRole("button", { name: "Excel indir" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);

  // Kişi profilinde "Yetkinliklerim"
  await switchUser(page, sicil("YTK", testInfo.project.name));
  await page.goto("/profile");
  await expect(main(page).getByRole("heading", { name: "Yetkinliklerim" })).toBeVisible();
  await expect(main(page).getByText(competency, { exact: true })).toBeVisible();
});

test("kararlar #222–225: İK eski personelin son eğitim tarihini girer; tarihi olmayana Şimdi başlat ile periyodik eğitim açılır", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const p = testInfo.project.name[0];
  const moduleTitle = `E2E Periyodik eğitim ${suffix()} ${p}`;
  const row = (kind: string) => main(page).getByRole("listitem").filter({ hasText: sicil(kind, testInfo.project.name) });
  const pick = (name: string) => main(page).getByRole("checkbox", { name: new RegExp(`^${name} ${p} `) }).check();
  const startNow = async () => {
    page.once("dialog", (d) => void d.accept());
    await main(page).getByRole("button", { name: "Şimdi başlat" }).click();
  };

  await login(page, sicil("HR", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);

  // Kağıt kayıttaki son eğitim 13 ay önce: geçerlilik (12 ay) dolmuş, eğitim bu gece açılacak görünür
  await page.goto(`/manage/periodic?q=${encodeURIComponent(sicil("PTR", testInfo.project.name))}`);
  await expect(row("PTR").getByText("Tarih yok")).toBeVisible();
  const last = new Date();
  last.setMonth(last.getMonth() - 13);
  await pick("Deneme Tarih");
  // Süzgeçteki "Modül" alanı da aynı adı taşır; işlem alanı tam adla bulunur
  await main(page).getByLabel("Modül", { exact: true }).selectOption({ label: moduleTitle });
  await main(page).getByLabel("Son eğitim tarihi").fill(last.toISOString().slice(0, 10));
  await main(page).getByRole("button", { name: "Tarihi kaydet" }).click();
  await expect(main(page).getByRole("status").filter({ hasText: "1 kişiye tarih kaydedildi" })).toBeVisible();
  await expect(row("PTR").getByText(/Son: .+ · açılış: .+ · girilen tarih/)).toBeVisible();
  // Tarihi girilmiş kişiye "Şimdi başlat" eğitim açmaz; gece işi açar
  await pick("Deneme Tarih");
  await startNow();
  await expect(main(page).getByRole("status").filter({ hasText: "0 kişiye periyodik eğitim açıldı; 1 kişi atlandı" })).toBeVisible();

  // Tarihi ve sistem kaydı olmayan kişiye hemen açılır
  await page.goto(`/manage/periodic?q=${encodeURIComponent(sicil("PER", testInfo.project.name))}`);
  await expect(row("PER").getByText(moduleTitle)).toBeVisible();
  await expect(row("PER").getByText("Tarih yok")).toBeVisible();
  await pick("Deneme Periyodik");
  await startNow();
  await expect(main(page).getByRole("status").filter({ hasText: "1 kişiye periyodik eğitim açıldı" })).toBeVisible();
  await expect(row("PER").getByText("Eğitimde")).toBeVisible();

  // Kişi eğitimini "Eğitimlerim"de görür
  await switchUser(page, sicil("PER", testInfo.project.name));
  await page.goto("/learn");
  await expect(main(page).getByText(moduleTitle).first()).toBeVisible();
});

test("kararlar #226–229: İSG uzmanı ve İK kayıt defterinden OSGB Excel ve CSV dosyasını indirir; tam TC yalnızca İK'da", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const download = async (name: string) => page.request.get((await main(page).getByRole("link", { name }).getAttribute("href"))!);

  await login(page, sicil("OHS", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);
  await page.goto("/reports/ohs");
  await expect(main(page).getByRole("heading", { level: 2, name: "OSGB dosyası" })).toBeVisible();
  await expect(main(page).getByText(/TC kimlik no sütunu boş gelir/)).toBeVisible();
  const xlsx = await download("OSGB Excel");
  expect(xlsx.ok()).toBe(true);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
  const csv = await download("OSGB CSV");
  expect(csv.ok()).toBe(true);
  expect(csv.headers()["content-type"]).toContain("text/csv");

  await switchUser(page, sicil("HR", testInfo.project.name));
  await page.goto("/reports/ohs");
  await expect(main(page).getByText(/Dosyada tam TC kimlik numarası yer alır/)).toBeVisible();
  expect((await download("OSGB CSV")).ok()).toBe(true);
});

test("kararlar #237–242: İK yönetim özetini açar, sayıları tablo olarak görür ve Excel'i indirir", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await login(page, sicil("HR", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);
  await page.goto("/reports");
  await main(page).getByRole("link", { name: /Yönetim özeti/ }).click();
  await page.waitForURL(/\/reports\/summary/);
  await expect(main(page).getByRole("heading", { level: 1, name: "Yönetim özeti" })).toBeVisible();
  await expect(main(page).getByRole("heading", { level: 2, name: "Son 12 ay" })).toBeVisible();

  await main(page).getByText("Sayıları tablo olarak gör").click();
  await expect(main(page).getByRole("columnheader", { name: "Ay", exact: true })).toBeVisible();
  await expect(main(page).getByRole("table").getByRole("row")).toHaveCount(13);

  const xlsx = await page.request.get((await main(page).getByRole("link", { name: "Excel indir" }).getAttribute("href"))!);
  expect(xlsx.ok()).toBe(true);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
});

test("FG-1.5 kararlar #232–233: kişi profilde açık rıza verip fotoğraf yükler; İK kişi sayfasında fotoğrafı görür", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const p = testInfo.project.name[0];
  const name = `Deneme Fotoğraf ${p}`;
  const photo = await sharp({ create: { width: 96, height: 96, channels: 3, background: { r: 40, g: 120, b: 200 } } }).png().toBuffer();

  await login(page, sicil("FOT", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);
  await page.goto("/profile");
  // Onay ekranında rıza verilmedi: fotoğraf eklenemez, rıza istenir
  await expect(main(page).getByText(/Profil fotoğrafı eklemek isteğe bağlıdır ve açık rızanızı gerektirir/)).toBeVisible();
  await expect(main(page).locator('input[type="file"]')).toHaveCount(0);
  await main(page).getByRole("button", { name: "Açık rıza ver" }).click();
  await expect(main(page).getByRole("button", { name: "Açık rızayı geri al" })).toBeVisible();

  await main(page).locator('input[type="file"]').setInputFiles({ name: "fotograf.png", mimeType: "image/png", buffer: photo });
  await expect(main(page).getByText("Fotoğraf hazırlanıyor…")).toBeVisible({ timeout: 30_000 });

  // E2E'de worker çalışmaz: fotoğrafı worker'ın işleviyle hazırla
  const [row] = await db()
    .select({ userId: personnel.userId, photoAssetId: personnel.photoAssetId })
    .from(personnel)
    .where(eq(personnel.sicilNo, sicil("FOT", testInfo.project.name)))
    .limit(1);
  expect(row?.photoAssetId).toBeTruthy();
  await processMediaAsset(row!.photoAssetId!);
  const image = main(page).getByRole("img", { name: `${name} profil fotoğrafı` });
  await expect(image).toBeVisible({ timeout: 15_000 });
  expect((await page.request.get(`/api/media/${row!.photoAssetId}/thumb`)).ok()).toBe(true);

  await switchUser(page, sicil("HR", testInfo.project.name));
  await page.goto(`/admin/people/${row!.userId}`);
  await expect(main(page).getByRole("img", { name: `${name} profil fotoğrafı` })).toBeVisible();
});

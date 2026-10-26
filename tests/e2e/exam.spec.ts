import { expect, test } from "@playwright/test";
import { acceptConsentIfAsked, login } from "./helpers";
import { E2E_PASSWORD } from "./global-setup";

const sicil = (kind: string, projectName: string) => `E2E-${process.env.E2E_SUFFIX}-${kind}${projectName[0]}`;

test("FG-6.1 gözetmen kod üretir; kursiyer kodla sınava girer, cevaplar, sonucu görür; bölüm sorumlusu denemeyi görür", async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const p = testInfo.project.name[0];
  const contextOptions = testInfo.project.use;

  // 1) Eğitmen gözetmen kodu üretir
  const trainerCtx = await browser.newContext(contextOptions);
  const trainer = await trainerCtx.newPage();
  await login(trainer, sicil("TR", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(trainer);
  await trainer.goto("/manage/proctor");
  await trainer.getByLabel("Yer (isteğe bağlı)").fill("E2E salonu");
  await trainer.getByRole("button", { name: "Kod üret" }).click();
  const codeText = trainer.locator("p.font-mono").filter({ visible: true });
  await expect(codeText).toHaveText(/^\d{3} \d{3}$/);
  const code = ((await codeText.textContent()) ?? "").replace(/\s/g, "");
  await expect(trainer.getByText("Geçerli kodlarınız")).toBeVisible();
  await trainerCtx.close();

  // 2) Kursiyer sınav modülünü açar; yanlış kod reddedilir, doğru kodla başlar
  const traineeCtx = await browser.newContext(contextOptions);
  const page = await traineeCtx.newPage();
  await login(page, sicil("SNV", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);
  await page.goto("/learn");
  await page.getByRole("button", { name: /^(Başla|Devam et)$/ }).click();
  await page.waitForURL(/\/learn\/[0-9a-f-]{36}\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`E2E Teorik sınav ${p}`);
  await expect(page.getByText("4 soru")).toBeVisible();
  const codeInput = page.getByLabel("Gözetmen kodu");
  await codeInput.fill(code === "000000" ? "111111" : "000000");
  await page.getByRole("button", { name: "Sınavı başlat" }).click();
  await expect(page.getByText(/Gözetmen kodu geçersiz/)).toBeVisible();
  await codeInput.fill(code);
  await page.getByRole("button", { name: "Sınavı başlat" }).click();
  await page.waitForURL(/\/exam\/[0-9a-f-]{36}/);

  // 3) Sorular tek tek; seçim anında kaydedilir; son soruda teslim
  await expect(page.getByRole("timer")).toBeVisible();
  // Havuzda ortak İSG modülünün soruları da olabilir (karar #59): bilinen doğru şık yoksa ilk şık seçilir
  for (let i = 1; i <= 4; i++) {
    await expect(page.getByText(`Soru ${i} / 4`).first()).toBeVisible();
    const known = page.getByLabel(/Doğru cevap/);
    await ((await known.count()) ? known : page.getByRole("radio").first()).check();
    await expect(page.getByText("Cevabınız kaydedildi.")).toBeVisible();
    if (i < 4) await page.getByRole("button", { name: "Sonraki" }).click();
  }
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Sınavı bitir" }).click();

  // 4) Sonuç: puan, sonuç, konu özeti; sorular ve doğru cevaplar gösterilmez
  await expect(page.getByText(/^\d+ puan$/)).toBeVisible();
  await expect(page.getByText(/^(Başarılı|Başarısız)$/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Konulara göre sonuç" })).toBeVisible();
  await expect(page.getByText("Sınav güvenliği için sorular ve doğru cevaplar gösterilmez.")).toBeVisible();
  await expect(page.getByText("E2E sınav sorusu 1")).toHaveCount(0);
  await traineeCtx.close();

  // 5) Bölüm sorumlusu ekip ekranında denemeyi, gözetmeni ve sekme çıkışlarını görür
  const smCtx = await browser.newContext(contextOptions);
  const sm = await smCtx.newPage();
  await login(sm, sicil("SM", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(sm);
  await sm.goto("/manage/team");
  // Aynı kapsamda diğer projenin kursiyeri de görünür: yalnızca bu kursiyerin satırına bakılır
  const row = sm.locator("details").filter({ hasText: `Deneme Sınav Kursiyeri ${p}` });
  await row.getByText(`Deneme Sınav Kursiyeri ${p}`).click();
  await expect(row.getByText(`E2E Teorik sınav ${p} · 1. deneme`)).toBeVisible();
  await expect(row.getByText("Gözetmen: Deneme Eğitmen", { exact: false })).toBeVisible();
  await smCtx.close();
});

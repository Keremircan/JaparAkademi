import { expect, test, type Locator, type Page } from "@playwright/test";
import { acceptConsentIfAsked, login } from "./helpers";
import { E2E_PASSWORD } from "./global-setup";

const sicil = (kind: string, projectName: string) => `E2E-${process.env.E2E_SUFFIX}-${kind}${projectName[0]}`;

/** İmza alanına fareyle bir çizgi çizer. */
async function draw(page: Page, canvas: Locator) {
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 20 + i * ((box.width - 40) / 12), box.y + box.height / 2 + (i % 2 ? -25 : 25), { steps: 2 });
  await page.mouse.up();
}

test("FG-5.2 / FG-6.2 eğitmen görevleri işaretler, pratik sınavı imzalatır; bölüm sorumlusu 2. imzayla kesinleştirir", async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  const p = testInfo.project.name[0];
  const contextOptions = testInfo.project.use;
  const trainee = `Deneme Pratik Kursiyeri ${p}`;

  // 1) Eğitmen görevleri sırayla "tek başına yaptı" seviyesine getirir
  const trainerCtx = await browser.newContext(contextOptions);
  const trainer = await trainerCtx.newPage();
  await login(trainer, sicil("TR", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(trainer);
  await trainer.goto("/trainer");
  const card = trainer.locator("li").filter({ hasText: trainee }).filter({ visible: true }).first();
  await card.getByRole("button", { name: "Görevleri işaretle" }).click();
  await trainer.waitForURL(/\/trainer\/practice\//);
  await expect(trainer.getByRole("heading", { level: 1 })).toHaveText(`E2E Hat pratiği ${p}`);

  // Seviye atlanamaz: her görev için yalnızca bir üst seviye düğmesi gösterilir
  for (const task of ["E2E kalıp bağlama", "E2E ilk parça onayı"]) {
    const item = trainer.getByRole("listitem").filter({ has: trainer.getByRole("heading", { name: new RegExp(task) }) }).filter({ visible: true });
    for (const level of ["Usta gösterdi", "Gözetiminde yaptı", "Tek başına yaptı"]) {
      await item.getByRole("button", { name: `İşaretle: ${level}` }).click();
      await item.getByRole("button", { name: `Kaydet: ${level}` }).click();
      await expect(item.getByText(level, { exact: true }).first()).toBeVisible();
    }
  }
  await expect(trainer.getByText(/Modül tamamlandı/)).toBeVisible();

  // 2) Pratik sınav: kriterler, kursiyer ve eğitmen imzası
  await trainer.goto("/trainer");
  await trainer.locator("li").filter({ hasText: trainee }).filter({ visible: true }).first().getByRole("button", { name: "Pratik sınavı başlat" }).click();
  await trainer.waitForURL(/\/trainer\/evaluations\//);
  await expect(trainer.getByRole("button", { name: "İmzaya geç" })).toBeDisabled();
  for (const radio of await trainer.getByRole("radio", { name: "Yapabildi" }).all()) await radio.check({ force: true });
  await expect(trainer.getByText("Taslak kaydedildi")).toBeVisible();
  await trainer.getByRole("button", { name: "İmzaya geç" }).click();
  await expect(trainer.getByText("100 puan")).toBeVisible();
  await draw(trainer, trainer.getByRole("img", { name: /Kursiyer imzası/ }));
  await draw(trainer, trainer.getByRole("img", { name: /Değerlendiren imzası/ }));
  await trainer.getByRole("button", { name: "İmzala ve gönder" }).click();
  await expect(trainer.getByText("2. imza bekleniyor").first()).toBeVisible();
  await expect(trainer.getByText("Değerlendiren (1. imza)")).toBeVisible();
  await trainerCtx.close();

  // 3) Bölüm sorumlusu onay kuyruğundan açar ve 2. imzayı atar
  const smCtx = await browser.newContext(contextOptions);
  const sm = await smCtx.newPage();
  await login(sm, sicil("SM", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(sm);
  await sm.goto("/manage/approvals");
  await sm.getByRole("link", { name: new RegExp(trainee) }).click();
  await sm.waitForURL(/\/trainer\/evaluations\//);
  await draw(sm, sm.getByRole("img", { name: /Bölüm sorumlusu imzası/ }));
  await sm.getByRole("button", { name: "İmzala ve kesinleştir" }).click();
  await expect(sm.getByText("Kesinleşti").first()).toBeVisible();
  await expect(sm.getByText("Bölüm sorumlusu (2. imza)")).toBeVisible();
  await smCtx.close();

  // 4) Kursiyer eğitimi bitirmiş olarak görür
  const traineeCtx = await browser.newContext(contextOptions);
  const page = await traineeCtx.newPage();
  await login(page, sicil("PRA", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);
  await page.goto("/learn");
  await expect(page.getByText(/Zorunlu modüllerin hepsini tamamladınız/)).toBeVisible();
  await page.goto("/learn/practice");
  await expect(page.getByText("Tek başına yaptı").first()).toBeVisible();
  await traineeCtx.close();
});

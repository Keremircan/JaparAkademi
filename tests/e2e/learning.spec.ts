import { expect, test, type Page } from "@playwright/test";
import { acceptConsentIfAsked, login } from "./helpers";
import { E2E_PASSWORD } from "./global-setup";

const sicil = (kind: string, projectName: string) => `E2E-${process.env.E2E_SUFFIX}-${kind}${projectName[0]}`;

/** Açık modülün tüm adımlarını sona kaydırıp "Okudum, anladım" der; ara değerlendirme varsa durur. */
async function finishSteps(page: Page) {
  // Next, önceki sayfaları gizli olarak DOM'da tutabilir: yalnızca görünen öğeler kullanılır
  const done = page.getByText("Bu modülü tamamladınız.").filter({ visible: true }).first();
  const quiz = page.getByRole("heading", { name: "Ara değerlendirme" });
  const ack = page.getByRole("button", { name: "Okudum, anladım" });
  const heading = page.locator("#step-heading").filter({ visible: true });
  for (let i = 0; i < 30; i++) {
    await expect(done.or(quiz).or(ack).first()).toBeVisible();
    if ((await done.isVisible()) || (await quiz.isVisible())) return;
    const before = await heading.first().textContent();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(ack).toBeEnabled();
    await ack.click();
    // Sonraki adıma geçilmesini (ya da modülün bitmesini) bekle
    await expect(async () => {
      const moved = (await heading.count()) === 0 || (await heading.first().textContent()) !== before;
      expect(moved || (await done.isVisible()) || (await quiz.isVisible())).toBe(true);
    }).toPass();
  }
}

test("FG-3.2 / FG-4.2 / FG-4.3 yeni giren kursiyer modülleri sırayla tamamlar ve ara değerlendirmeyi cevaplar", async ({ page }, testInfo) => {
  // Bütün modülleri arayüzden yürür (ortak İSG modülü dahil); yavaş makinede 3 dk yetmeyebiliyor
  test.setTimeout(300_000);
  const p = testInfo.project.name[0];
  const ours = `E2E Hat eğitimi ${p}`;
  await login(page, sicil("KUR", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);

  await page.goto("/learn");
  await expect(page.getByText("Sıradaki adımınız")).toBeVisible();
  // Ön koşul kilidi (FG-3.4): kendi modülümüz kart modülünü bekler
  await expect(page.getByText(ours)).toBeVisible();
  await expect(page.getByText(/Önce tamamlayın: .*Pozisyon kartı/)).toBeVisible();

  for (let n = 0; n < 10; n++) {
    await page.goto("/learn");
    const allDone = page.getByText(/Zorunlu modüllerin hepsini tamamladınız/);
    const next = page.getByRole("button", { name: /^(Başla|Devam et)$/ });
    await expect(allDone.or(next).first()).toBeVisible();
    if (await allDone.isVisible()) break;
    await next.click();
    await page.waitForURL(/\/learn\/[0-9a-f-]{36}\/[0-9a-f-]{36}/);
    // Önceki sayfalar gizli tutulabildiği için yalnızca görünen ana başlık okunur
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).not.toHaveText("Eğitimlerim");
    const title = (await h1.textContent()) ?? "";
    await finishSteps(page);
    if (title === ours) {
      // Ara değerlendirme: yanlışta doğru cevap ve açıklama gösterilir
      await page.getByRole("group", { name: /Hatta ne takılır/ }).getByLabel("Şapka").check();
      await page.getByRole("button", { name: "Cevapla" }).first().click();
      await expect(page.getByText("Yanlış. Doğru cevap işaretlendi.")).toBeVisible();
      await expect(page.getByText("Eldiven zorunludur.")).toBeVisible();
      await page.getByRole("group", { name: /Arızada kime/ }).getByLabel("Bakım").check();
      await page.getByRole("button", { name: "Cevapla" }).first().click();
      await expect(page.getByText("Bakım ekibine haber verilir.")).toBeVisible();
      await page.getByRole("group", { name: /Işık perdesi/ }).getByLabel("Yanlış").check();
      await page.getByRole("button", { name: "Cevapla" }).first().click();
    }
    await expect(page.getByText("Bu modülü tamamladınız.")).toBeVisible();
  }

  await page.goto("/learn");
  await expect(page.getByText(/Zorunlu modüllerin hepsini tamamladınız/)).toBeVisible();
});

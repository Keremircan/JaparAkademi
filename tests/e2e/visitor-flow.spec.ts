import { expect, test, type Locator, type Page } from "@playwright/test";
import { acceptConsentIfAsked, login } from "./helpers";
import { E2E_PASSWORD } from "./global-setup";
import { testNationalId } from "../support/national-id";

const sicil = (kind: string, projectName: string) => `E2E-${process.env.E2E_SUFFIX}-${kind}${projectName[0]}`;

async function draw(page: Page, target: Locator) {
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 20 + i * ((box.width - 40) / 12), box.y + box.height / 2 + (i % 2 ? -25 : 25), { steps: 2 });
  await page.mouse.up();
}

test("SPEC 8.2 ziyaretçi QR ile kendini kaydeder, İngilizce bilgilendirmeyi tamamlar; güvenlik listede görür", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const name = `E2E Walk-in ${testInfo.project.name} ${Date.now()}`;

  // Ziyaretçi: hesapsız, İngilizce
  await page.goto("/en/visit");
  await expect(page.getByRole("heading", { level: 1, name: "Visitor registration" })).toBeVisible();
  await page.getByLabel("Type of visit").selectOption("office");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Phone").fill("05551234567");
  await page.getByLabel("Who are you visiting?").fill("Deneme İK");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/en\/v\/[A-Za-z0-9_-]{43}$/);

  await page.getByRole("button", { name: "Start" }).click();
  // Kartlar en az bekleme süresi dolmadan geçilemez
  const next = page.getByRole("button", { name: /Go to confirmation|Next card/ });
  await expect(next).toBeEnabled({ timeout: 90_000 });
  while (await page.getByRole("button", { name: "Next card" }).isVisible()) {
    await page.getByRole("button", { name: "Next card" }).click();
    await expect(page.getByRole("button", { name: /Go to confirmation|Next card|Go to questions/ })).toBeEnabled({ timeout: 90_000 });
  }
  await page.getByRole("button", { name: "Go to confirmation" }).click();

  await page.getByRole("checkbox", { name: "I have read the site rules and will follow them." }).click();
  await page.getByRole("checkbox", { name: "I have read the privacy notice." }).click();
  await draw(page, page.getByRole("img", { name: /Your signature/ }));
  await page.getByRole("button", { name: "Confirm and finish" }).click();
  await expect(page.getByText("Briefing completed")).toBeVisible();
  const code = await page.locator(".font-mono").first().textContent();
  expect(code).toMatch(/^\d{6}$/);

  // Güvenlik: kendi kaydı ve bilgilendirildi durumu
  await page.context().clearCookies();
  await login(page, sicil("SEC", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);
  await page.goto("/security/visits");
  const row = page.getByRole("link", { name: new RegExp(name) }).filter({ visible: true });
  await expect(row).toBeVisible();
  await expect(row.getByText("Kendi kaydı")).toBeVisible();
  await expect(row.getByText("Bilgilendirildi")).toBeVisible();
  await row.click();
  await expect(page.getByText(code!, { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText(/Deneme İK \(ziyaretçinin yazdığı\)/).filter({ visible: true })).toBeVisible();

  // Kapı (2.3b): kodla bul, gerçek ev sahibi + TC + kart no ile giriş, sonra çıkış
  await page.goto(`/security/gate?q=${code}`);
  const item = page.getByRole("listitem").filter({ hasText: name }).filter({ visible: true });
  await item.getByRole("button", { name: "Giriş yap" }).click();
  await item.getByLabel(/Ev sahibinin sicil no/).fill(sicil("HR", testInfo.project.name));
  await item.getByLabel("Kimlik numarası").fill(testNationalId(Date.now() % 900_000_000));
  await item.getByLabel("Kart no").fill("E2E-1");
  await item.getByRole("checkbox", { name: "Baret" }).click();
  await item.getByRole("button", { name: "Girişi onayla" }).click();
  await expect(page.getByText("İçeride (", { exact: false }).filter({ visible: true })).toBeVisible();
  const inside = page.getByRole("listitem").filter({ hasText: name }).filter({ visible: true });
  await inside.getByRole("button", { name: "Çıkış yap" }).click();
  await inside.getByRole("button", { name: "Çıkışı onayla" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: name }).filter({ visible: true })).toHaveCount(0);
});

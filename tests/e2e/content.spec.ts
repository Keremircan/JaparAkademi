import { expect, test, type Page } from "@playwright/test";
import { acceptConsentIfAsked, login } from "./helpers";
import { E2E_PASSWORD } from "./global-setup";

const sicil = (kind: string, projectName: string) => `E2E-${process.env.E2E_SUFFIX}-${kind}${projectName[0]}`;

async function logout(page: Page) {
  await page.goto("/profile");
  await page.getByRole("main").getByRole("button", { name: "Çıkış yap" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

async function createContent(page: Page, type: RegExp, title: string, opts: { ohs?: boolean } = {}) {
  await page.goto("/manage/library/new");
  await page.locator("label").filter({ hasText: type }).click();
  await page.getByRole("textbox", { name: "Başlık", exact: true }).fill(title);
  await page.getByLabel("Sahibi").selectOption({ label: `${process.env.E2E_DEPARTMENT} / E2E Hat` });
  if (opts.ohs) await page.getByRole("checkbox", { name: /İSG içeriği/ }).check();
  await page.getByRole("button", { name: "Oluştur ve düzenle" }).click();
  await expect(page.getByRole("heading", { name: "İçeriği düzenle" })).toBeVisible();
}

test("FG-2.3 eğitmenin kontrol listesi bölüm sorumlusu onayıyla yayınlanır", async ({ page }, testInfo) => {
  const title = `E2E kontrol listesi ${testInfo.project.name} ${Date.now()}`;
  await login(page, sicil("TR", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);

  await createContent(page, /Kontrol listesi/, title);
  await page.getByRole("button", { name: "Madde ekle" }).click();
  await page.getByLabel("Madde", { exact: true }).fill("Acil durdurma butonu çalışıyor");
  await page.getByText("Kritik madde").click();
  await page.getByRole("button", { name: "Kaydet ve onaya gönder" }).click();
  await expect(page.getByText("Bu sürüm bölüm onayı bekliyor.")).toBeVisible();
  await logout(page);

  await login(page, sicil("SM", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);
  await page.goto("/manage/approvals");
  await page.getByRole("link", { name: new RegExp(title) }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Onayla" }).click();
  await expect(page.getByText("Yayında (s1)").first()).toBeVisible();
  await expect(page.getByText("Acil durdurma butonu çalışıyor")).toBeVisible();
});

test("FG-2.3 İSG içeriği bölüm sorumlusundan sonra İSG uzmanının onayına gider", async ({ page }, testInfo) => {
  const title = `E2E İSG metni ${testInfo.project.name} ${Date.now()}`;
  await login(page, sicil("SM", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);

  await createContent(page, /^Metin/, title, { ohs: true });
  await page.locator("#body").click();
  await page.keyboard.type("Kulak koruyucu takılmadan hatta girilmez.");
  await page.getByRole("button", { name: "Kaydet ve onaya gönder" }).click();
  await expect(page.getByText("Bu sürüm İSG uzmanı onayı bekliyor.")).toBeVisible();
  await logout(page);

  await login(page, sicil("OHS", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);
  await page.goto("/manage/approvals");
  await page.getByRole("link", { name: new RegExp(title) }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Onayla" }).click();
  await expect(page.getByText("Yayında (s1)").first()).toBeVisible();

  await page.goto(`/manage/library?q=${encodeURIComponent("koruyucu")}`);
  await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
});

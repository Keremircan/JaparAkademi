import { expect, test } from "@playwright/test";
import { acceptConsentIfAsked, login } from "./helpers";
import { E2E_PASSWORD } from "./global-setup";

test("karar #291: İK pozisyonun vardiyalarını listeden işaretler", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const suffix = process.env.E2E_SUFFIX!;
  const p = testInfo.project.name[0];
  const position = `E2E Vardiya Pozisyonu ${suffix} ${p}`;

  await login(page, `E2E-${suffix}-HR${p}`, E2E_PASSWORD);
  await acceptConsentIfAsked(page);
  await page.goto("/admin/org");
  await page.getByRole("main").filter({ visible: true }).getByRole("button", { name: "Tümünü aç" }).click();
  await page.getByRole("main").filter({ visible: true }).getByRole("link", { name: new RegExp(position) }).click();
  await page.waitForURL(/\/admin\/org\/positions\/[0-9a-f-]+$/);

  const shifts = page.getByRole("group", { name: /Vardiya düzeni/ }).filter({ visible: true });
  await expect(shifts.getByRole("checkbox")).toHaveCount(4);
  await shifts.getByRole("checkbox", { name: "23:00 – 07:00" }).check();
  await shifts.getByRole("checkbox", { name: "15:00 – 23:00" }).check();
  await page.getByRole("button", { name: "Kaydet" }).filter({ visible: true }).click();
  await page.waitForURL(/\/admin\/org$/);

  await page.getByRole("main").filter({ visible: true }).getByRole("link", { name: new RegExp(position) }).click();
  await page.waitForURL(/\/admin\/org\/positions\/[0-9a-f-]+$/);
  const again = page.getByRole("group", { name: /Vardiya düzeni/ }).filter({ visible: true });
  await expect(again.getByRole("checkbox", { name: "23:00 – 07:00" })).toBeChecked();
  await expect(again.getByRole("checkbox", { name: "15:00 – 23:00" })).toBeChecked();
  await expect(again.getByRole("checkbox", { name: "07:00 – 15:00" })).not.toBeChecked();
  await expect(again.getByRole("checkbox", { name: "08:00 – 18:00" })).not.toBeChecked();
});

test("karar #292: Pozisyon ekle her birimde o birimi seçer; bağlantıyla yeniden açılan form boştur, geri tuşunda taslak kalır", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const suffix = process.env.E2E_SUFFIX!;
  const p = testInfo.project.name[0];
  const main = () => page.getByRole("main").filter({ visible: true });
  const field = (id: string) => main().locator(`#${id}`).filter({ visible: true });
  const addPosition = 'a[href*="/admin/org/positions/new?orgUnitId="]';
  // Diğer testlerin saydığı birimlere kayıt eklenmez: ortak departman ve bölümde yalnızca form açılır
  const unitHref = (name: string) =>
    main()
      .locator("[data-org-unit]")
      .filter({ has: page.getByRole("heading", { name, exact: true }) })
      .locator(addPosition)
      .first()
      .getAttribute("href");
  const open = async (href: string) => {
    await main().locator(`a[href="${href}"]`).click();
    await page.waitForURL(/\/admin\/org\/positions\/new/);
  };
  const backToOrg = async () => {
    await main().getByRole("link", { name: "Organizasyon yapısı" }).click();
    await page.waitForURL(/\/admin\/org$/);
    await main().locator(addPosition).first().waitFor();
  };

  await login(page, `E2E-${suffix}-HR${p}`, E2E_PASSWORD);
  await acceptConsentIfAsked(page);
  await page.goto("/admin/org");
  await main().getByRole("button", { name: "Tümünü aç" }).click();
  await main().locator(addPosition).first().waitFor();
  const dept = (await unitHref(`E2E Departman ${suffix}`))!;
  const section = (await unitHref("E2E Hat"))!;
  const unitOf = (href: string) => new URL(href, "http://x").searchParams.get("orgUnitId")!;

  // Önceki açılış gizli tutulsa da (cacheComponents) her birimde o birim seçili gelir
  for (const href of [dept, section, dept]) {
    await open(href);
    await expect(field("orgUnitId")).toHaveValue(unitOf(href));
    await backToOrg();
  }

  // Bağlantıyla yeniden açılan form boştur (kayıttan sonra da aynı yol: kaydet → organizasyon yapısı)
  await open(section);
  await field("name").fill("Önceki yazı");
  await main().getByRole("checkbox", { name: "07:00 – 15:00" }).filter({ visible: true }).check();
  await backToOrg();
  await open(section);
  await expect(field("name")).toHaveValue("");
  await expect(main().getByRole("checkbox", { name: "07:00 – 15:00" }).filter({ visible: true })).not.toBeChecked();

  // Tarayıcının geri tuşu yazılanı korur
  await field("name").fill("Yarım kalan taslak");
  await backToOrg();
  await page.goBack();
  await page.waitForURL(/\/admin\/org\/positions\/new/);
  await expect(field("name")).toHaveValue("Yarım kalan taslak");
  await expect(field("orgUnitId")).toHaveValue(unitOf(section));
});

test("karar #294: departman ve bölümler kapalı başlar, adına tıklanınca açılır, başka sayfadan dönünce açık kalır; Tümünü aç/kapat", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const suffix = process.env.E2E_SUFFIX!;
  const p = testInfo.project.name[0];
  const main = () => page.getByRole("main").filter({ visible: true });
  const dept = () => main().getByRole("button", { name: `E2E Departman ${suffix}`, exact: true });
  const section = () => main().getByRole("button", { name: "E2E Hat", exact: true });
  const position = () => main().getByRole("link", { name: new RegExp(`E2E Vardiya Pozisyonu ${suffix} ${p}`) });

  await login(page, `E2E-${suffix}-HR${p}`, E2E_PASSWORD);
  await acceptConsentIfAsked(page);
  await page.goto("/admin/org");

  // Kapalı departmanın başlığı ve sayıları görünür, içi görünmez
  await expect(dept()).toHaveAttribute("aria-expanded", "false");
  await expect(main().getByRole("heading", { name: `E2E Departman ${suffix}`, exact: true })).toBeVisible();
  await expect(section()).toBeHidden();

  await dept().click();
  await expect(dept()).toHaveAttribute("aria-expanded", "true");
  await expect(section()).toHaveAttribute("aria-expanded", "false");
  await expect(position()).toBeHidden();
  await section().click();
  await expect(position()).toBeVisible();

  // Pozisyona gidip dönünce açtıklarınız açık kalır
  await position().click();
  await page.waitForURL(/\/admin\/org\/positions\/[0-9a-f-]+$/);
  await main().getByRole("link", { name: "Organizasyon yapısı" }).click();
  await page.waitForURL(/\/admin\/org$/);
  await expect(position()).toBeVisible();

  await main().getByRole("button", { name: "Tümünü kapat" }).click();
  await expect(position()).toBeHidden();
  await expect(dept()).toHaveAttribute("aria-expanded", "false");
  await main().getByRole("button", { name: "Tümünü aç" }).click();
  await expect(section()).toHaveAttribute("aria-expanded", "true");
  await expect(position()).toBeVisible();
});

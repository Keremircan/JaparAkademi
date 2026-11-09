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

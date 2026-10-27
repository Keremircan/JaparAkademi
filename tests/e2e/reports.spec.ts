import { expect, test } from "@playwright/test";
import { acceptConsentIfAsked, login } from "./helpers";
import { E2E_PASSWORD } from "./global-setup";

const sicil = (kind: string, projectName: string) => `E2E-${process.env.E2E_SUFFIX}-${kind}${projectName[0]}`;

test("SPEC 10.1 İK eğitim ilerleme raporunu filtreler, önizler ve Excel/PDF indirir", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await login(page, sicil("HR", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);
  await page.goto("/reports");
  await page.getByRole("link", { name: /Eğitim ilerleme/ }).click();
  await page.waitForURL(/\/reports\/training/);
  await expect(page.getByRole("heading", { level: 1, name: "Eğitim ilerleme" })).toBeVisible();

  // Birim filtresi: E2E departmanı; kendi kursiyerleri tabloda
  await page.getByLabel("Birim").selectOption({ label: process.env.E2E_DEPARTMENT! });
  await page.getByRole("button", { name: "Uygula" }).click();
  await page.waitForURL(/unit=/);
  await expect(page.getByRole("cell", { name: sicil("KUR", testInfo.project.name), exact: true })).toBeVisible();

  const xlsxHref = await page.getByRole("link", { name: "Excel indir" }).getAttribute("href");
  const xlsx = await page.request.get(xlsxHref!);
  expect(xlsx.ok()).toBe(true);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
  const pdf = await page.request.get((await page.getByRole("link", { name: "PDF indir" }).getAttribute("href"))!);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");

  // İSG defteri İK'ya açık; işe başlama süresi raporu da
  await page.goto("/reports");
  await expect(page.getByRole("link", { name: /İSG eğitim kayıt defteri/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /İşe başlama süresi/ })).toBeVisible();
});

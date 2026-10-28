import { expect, test } from "@playwright/test";
import { acceptConsentIfAsked, login } from "./helpers";
import { E2E_PASSWORD } from "./global-setup";
import { testNationalId } from "../support/national-id";

const sicil = (kind: string, projectName: string) => `E2E-${process.env.E2E_SUFFIX}-${kind}${projectName[0]}`;

test("SPEC 8.2 personel kendi ziyaretçisini önceden kaydeder", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const name = `E2E Misafir ${testInfo.project.name} ${Date.now()}`;
  await login(page, sicil("HR", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);
  await page.goto("/profile");
  await page.getByRole("button", { name: "Ziyaretçilerim" }).click();
  await page.waitForURL(/\/visits$/);
  await page.getByRole("button", { name: "Ziyaretçi kaydet" }).click();
  await page.waitForURL(/\/visits\/new$/);
  // Ev sahibi kimlik no alanını görmez (karar #129)
  await expect(page.getByLabel("Kimlik numarası")).toHaveCount(0);
  await page.getByLabel("Ad soyad").fill(name);
  await page.getByLabel(/Firma/).fill("Müşteri A.Ş.");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await page.waitForURL(/\/visits\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByText("Planlandı").first()).toBeVisible();
  await page.goto("/visits");
  await expect(page.getByRole("link", { name: new RegExp(name) }).filter({ visible: true })).toBeVisible();
});

test("SPEC 8.2 güvenlik başka bir personel adına kimlik no ile ön kayıt açar", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const name = `E2E Taşeron ${testInfo.project.name} ${Date.now()}`;
  await login(page, sicil("SEC", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);
  await page.goto("/security");
  await page.getByRole("link", { name: /Ziyaretler/ }).click();
  await page.waitForURL(/\/security\/visits/);
  await page.getByRole("button", { name: "Ziyaretçi kaydet" }).click();
  await page.waitForURL(/\/security\/visits\/new$/);
  await page.getByLabel("Ad soyad").fill(name);
  await page.getByLabel(/Ev sahibinin sicil no/).fill(sicil("HR", testInfo.project.name));
  await page.getByLabel(/Kimlik türü/).selectOption("tc");
  await page.getByLabel("Kimlik numarası").fill(testNationalId(Date.now() % 900_000_000));
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await page.waitForURL(/\/security\/visits\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByText(/^\d{3}\*{6}\d{2}$/)).toBeVisible();
  await expect(page.getByText("Deneme İK", { exact: true }).filter({ visible: true })).toBeVisible();
});

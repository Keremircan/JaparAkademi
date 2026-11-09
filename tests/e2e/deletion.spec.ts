import { expect, test } from "@playwright/test";
import { acceptConsentIfAsked, login } from "./helpers";
import { E2E_PASSWORD } from "./global-setup";

test("iş paketi 3.14 (kararlar #283–287): bağlı kayıt uyarısı, onaylı silme, geçmişi olan pozisyonu pasife alma", async ({ page }, testInfo) => {
  // Üç pencere akışı ve her silme/pasife almadan sonra organizasyon ağacının yeniden çizilmesi: geniş bekleme payı
  test.setTimeout(180_000);
  const rerender = { timeout: 60_000 };
  const suffix = process.env.E2E_SUFFIX!;
  const p = testInfo.project.name[0];
  const dept = `E2E Silme ${suffix} ${p}`;
  const section = `E2E Boş Bölüm ${suffix} ${p}`;
  const position = `E2E Geçmişli Pozisyon ${suffix} ${p}`;

  await login(page, `E2E-${suffix}-HR${p}`, E2E_PASSWORD);
  await acceptConsentIfAsked(page);
  await page.goto("/admin/org");
  const main = page.getByRole("main").filter({ visible: true });
  await main.getByRole("button", { name: "Tümünü aç" }).click();

  // Bölümü ve pozisyonu olan departman: "önce onları silin" uyarısı, silme düğmesi yok
  await main.getByRole("button", { name: `Sil: ${dept}` }).click();
  const blocked = page.getByRole("alertdialog", { name: "Önce bağlı kayıtları silin" });
  await expect(blocked.getByText("Silmek istediğiniz departmana bağlı kayıtlar var. Önce onları silin:")).toBeVisible();
  await expect(blocked.getByText("1 bölüm", { exact: true })).toBeVisible();
  await expect(blocked.getByText("1 pozisyon", { exact: true })).toBeVisible();
  await expect(blocked.getByRole("button", { name: "Evet, sil" })).toHaveCount(0);
  await blocked.getByRole("button", { name: "Tamam" }).click();
  await expect(blocked).toBeHidden();

  // Bağı olmayan bölüm: "Silmek istediğinize emin misiniz?" sorusuyla silinir
  await main.getByRole("button", { name: `Sil: ${section}` }).click();
  const confirm = page.getByRole("alertdialog", { name: "Silmek istediğinize emin misiniz?" });
  await expect(confirm.getByText(`“${section}” kalıcı olarak silinecek.`, { exact: false })).toBeVisible();
  await confirm.getByRole("button", { name: "Evet, sil" }).click();
  await expect(confirm).toBeHidden();
  await expect(main.getByText(section)).toHaveCount(0, rerender);

  // Yayınlanmış kartı olan pozisyon silinemez: pencereden pasife alınır ve listeden gizlenir
  await main.getByRole("button", { name: `Sil: ${position}` }).click();
  const history = page.getByRole("alertdialog", { name: "Bu kayıt silinemez" });
  await expect(history.getByText(/geçmiş eğitim, sınav, onay/)).toBeVisible();
  await history.getByRole("button", { name: "Pasife al" }).click();
  await expect(history).toBeHidden();
  await expect(main.getByText(position)).toHaveCount(0, rerender);

  await main.getByRole("button", { name: /^Pasifleri göster \(\d+\)$/ }).click(rerender);
  await expect(page).toHaveURL(/\/admin\/org\?passive=1$/, rerender);
  await expect(page.getByRole("main").filter({ visible: true }).getByText(position)).toBeVisible(rerender);
});

/**
 * İlk üst yöneticiyi (owner) tanımlar (iş paketi 2.6b, karar #193). Yalnızca sistemde aktif owner yokken çalışır;
 * sonraki owner'ları uygulamada bir owner verir (Personel → Rolleri düzenle).
 * Kullanım: npm run owner:grant -- <sicil no>
 */
import { systemActor } from "../src/server/authz/actor";
import { closeDb } from "../src/server/db/client";
import { bootstrapOwner } from "../src/server/services/roles";

async function main() {
  const sicil = process.argv[2];
  if (!sicil) {
    console.error("Kullanım: npm run owner:grant -- <sicil no>");
    process.exitCode = 1;
    return;
  }
  const result = await bootstrapOwner(systemActor("owner:grant"), sicil);
  if (result === "granted") console.log(`✓ ${sicil} artık üst yönetici (owner). Değişiklik bir sonraki sayfa yüklemesinde geçerli olur.`);
  else if (result === "exists") console.log("• Sistemde zaten üst yönetici var; yeni owner'ı uygulamadan bir owner verir.");
  else {
    console.error(`✗ ${sicil} sicilli aktif personel bulunamadı.`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());

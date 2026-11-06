import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { personnel } from "@/server/db/schema";
import { ValidationError } from "@/server/errors";

/**
 * Kişisel verisi silinmiş (anonimleştirilmiş) kişide değişiklik yapılamaz (karar #266): yeniden etkinleştirme, ad /
 * iletişim girme, rol verme, davet ya da fotoğraf kişiyi yeniden tanınır kılar veya ona hesap açar.
 * Bağımlılığı az tutulur: kişi, davet, rol ve profil servisleri döngüsüz içe aktarır.
 */
export async function assertNotErased(userId: string): Promise<void> {
  const [row] = await db().select({ at: personnel.anonymizedAt }).from(personnel).where(eq(personnel.userId, userId)).limit(1);
  if (row?.at) throw new ValidationError("person_erased");
}

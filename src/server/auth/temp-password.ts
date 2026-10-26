import { randomInt } from "node:crypto";
import { checkPassword } from "./password-policy";

/**
 * Geçici şifre: yalnızca rakamlardan oluşur (düşük okuryazarlıkta kolay okunur/yazılır),
 * ama şifre politikasından geçer (yaygın, tekrarlı, sıralı olamaz). Kişi ilk girişte değiştirir.
 */
export function generateTempPassword(minLength: number, sicilNo?: string): string {
  const length = Math.max(8, minLength);
  for (;;) {
    let value = "";
    for (let i = 0; i < length; i++) value += randomInt(0, 10).toString();
    if (checkPassword(value, { minLength: length, sicilNo }).length === 0) return value;
  }
}

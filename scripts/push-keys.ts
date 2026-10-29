/**
 * VAPID anahtarları üretir (web push, iş paketi 2.6, karar #175). Çıktıyı .env (ya da docker/.env.production) dosyasına yazın.
 * Gizli anahtar yalnızca sunucuda kalır; genel anahtar tarayıcıya verilir. Anahtar değişirse kişiler bildirimleri yeniden açmalıdır.
 *   npm run push:keys
 */
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
process.stdout.write(`VAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}\n`);

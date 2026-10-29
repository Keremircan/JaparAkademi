-- =====================================================================
-- İş paketi 2.6: web push — denetim kaydı
-- =====================================================================

-- Push adresi ve şifreleme anahtarları cihazı tanımlar: denetim kaydına maskeli yazılır.
-- Abonelik oturuma bağlı (ON DELETE CASCADE): çıkış, oturum sonu ve anonimleştirmede (oturumlar silinir) silinir.
SELECT app_attach_audit('push_subscriptions', '{id}', '{endpoint,p256dh,auth,user_agent}');
--> statement-breakpoint
SELECT app_attach_audit('push_outbox', '{id}');

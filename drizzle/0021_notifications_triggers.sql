-- =====================================================================
-- İş paketi 1.8a: bildirim, e-posta kuyruğu ve şifre sıfırlama trigger'ları
-- =====================================================================

SELECT app_attach_audit('notifications', '{id}');
--> statement-breakpoint
-- E-posta adresi ve gövde kişisel veri içerebilir: denetim kaydına maskeli yazılır
SELECT app_attach_audit('email_outbox', '{id}', '{to_address,body_text,body_html}');
--> statement-breakpoint
SELECT app_attach_audit('password_reset_tokens', '{id}', '{token_hash}');

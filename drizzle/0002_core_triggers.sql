-- =====================================================================
-- Çekirdek tablolar için denetim ve değiştirilemezlik trigger'ları
-- =====================================================================

SELECT app_attach_audit('users', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('accounts', '{id}', '{password,access_token,refresh_token,id_token}');
--> statement-breakpoint
-- Oturumlar: yalnızca açılış ve kapanış (her istekteki last_seen_at güncellemesi kaydedilmez)
SELECT app_attach_audit('sessions', '{id}', '{token}', 'INSERT OR DELETE');
--> statement-breakpoint
SELECT app_attach_audit('personnel', '{user_id}');
--> statement-breakpoint
SELECT app_attach_audit('user_roles', '{user_id,role}');
--> statement-breakpoint
SELECT app_attach_audit('settings', '{key}');
--> statement-breakpoint
SELECT app_attach_audit('corrections', '{id}');
--> statement-breakpoint

-- Değiştirilemez tablolar
SELECT app_attach_immutable('corrections');
--> statement-breakpoint
SELECT app_attach_immutable('audit_log');
--> statement-breakpoint
-- Giriş denemeleri güvenlik kaydıdır: yalnızca eklenir
SELECT app_attach_immutable('login_attempts');
--> statement-breakpoint

-- Denetim kaydını uygulama yalnızca okuyabilir; satırları audit_trigger (SECURITY DEFINER) yazar.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON audit_log FROM akademi_app;

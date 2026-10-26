-- =====================================================================
-- İş paketi 1.1: organizasyon, personel, KVKK ve aktarım tabloları için trigger'lar
-- =====================================================================

SELECT app_attach_audit('org_units', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('positions', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('role_scopes', '{user_id,role,org_unit_id}');
--> statement-breakpoint
SELECT app_attach_audit('legal_texts', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('consents', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('import_batches', '{id}');
--> statement-breakpoint

-- personnel denetimi zaten bağlı (0002); TC şifreli/HMAC alanlarının maskelenmesi için yeniden bağlanır.
SELECT app_attach_audit('personnel', '{user_id}', '{national_id_enc,national_id_hmac}');
--> statement-breakpoint

-- Değiştirilemez kayıtlar
SELECT app_attach_immutable('consents');
--> statement-breakpoint
SELECT app_attach_immutable('data_access_log');
--> statement-breakpoint
-- Yayınlanmış KVKK metni değişmez; taslakken başlık ve metin düzenlenebilir
SELECT app_attach_immutable('legal_texts', '{title,body}', 'published_at');
--> statement-breakpoint
-- Aktarım satırı onaylanınca (committed_at) donar; onaya kadar yalnızca sonuç alanları yazılır
SELECT app_attach_immutable('import_rows', '{status,user_id}', 'committed_at');

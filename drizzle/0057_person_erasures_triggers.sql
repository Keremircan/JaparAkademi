-- Kişiyi kalıcı silme kaydı (kararlar #264–267)

-- KVKK silme yönetmeliği: silme / anonimleştirme işlemleri kayıt altına alınır. Kayıt değiştirilemez ve silinemez.
SELECT app_attach_audit('person_erasures', '{id}');
--> statement-breakpoint
SELECT app_attach_immutable('person_erasures');

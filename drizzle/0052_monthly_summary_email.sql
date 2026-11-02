-- İş paketi 3.5 (karar #242): aylık yönetim özeti yeni bildirim türüdür ve varsayılan olarak e-postayla da gider.
-- E-posta olayları listesi Parametreler ekranından daha önce kaydedildiyse yeni tür listede yoktur; bir kez eklenir.
-- Sistem yöneticisi sonra ekrandan kaldırabilir (bu migration yeniden çalışmaz).
UPDATE settings
SET value = value || '["monthly_summary"]'::jsonb, updated_at = now()
WHERE key = 'notify.email_events'
  AND jsonb_typeof(value) = 'array'
  AND NOT (value @> '["monthly_summary"]'::jsonb);

-- İş paketi 3.10 (karar #295): bildirim listeleri Parametreler ekranından daha önce kaydedildiyse sonradan eklenen
-- türler listede yoktur. Varsayılanda açık olan şu türler bir kez eklenir:
--   e-posta: yetkinlik süresi yaklaşıyor (iş paketi 3.1)
--   telefon (push): yetkinlik süresi yaklaşıyor (3.1), aylık özet (3.5)
-- Liste hiç kaydedilmemişse (varsayılan geçerli) dokunulmaz. Sistem yöneticisi sonra ekrandan kaldırabilir
-- (bu migration yeniden çalışmaz).
UPDATE settings
SET value = value || '["competency_expiring"]'::jsonb, updated_at = now()
WHERE key = 'notify.email_events'
  AND jsonb_typeof(value) = 'array'
  AND NOT (value @> '["competency_expiring"]'::jsonb);
--> statement-breakpoint
UPDATE settings
SET value = value || '["competency_expiring"]'::jsonb, updated_at = now()
WHERE key = 'notify.push_events'
  AND jsonb_typeof(value) = 'array'
  AND NOT (value @> '["competency_expiring"]'::jsonb);
--> statement-breakpoint
UPDATE settings
SET value = value || '["monthly_summary"]'::jsonb, updated_at = now()
WHERE key = 'notify.push_events'
  AND jsonb_typeof(value) = 'array'
  AND NOT (value @> '["monthly_summary"]'::jsonb);

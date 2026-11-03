-- Çalışma programı (iş paketi 3.9, kararlar #251–257)

-- Denetim kaydı. Kişinin kendi programı (items) kişisel not içerebileceğinden maskelenir (karar #257).
SELECT app_attach_audit('work_schedules', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('schedule_choices', '{user_id}');
--> statement-breakpoint
SELECT app_attach_audit('personal_schedules', '{user_id,schedule_id}', '{items}');
--> statement-breakpoint

-- Günler ISO 1–7, en az bir gün; maddeler JSON dizisi
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_days_check"
  CHECK (cardinality("days") BETWEEN 1 AND 7 AND "days" <@ ARRAY[1,2,3,4,5,6,7]::smallint[]);
--> statement-breakpoint
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_items_check" CHECK (jsonb_typeof("items") = 'array');
--> statement-breakpoint
ALTER TABLE "personal_schedules" ADD CONSTRAINT "personal_schedules_items_check" CHECK (jsonb_typeof("items") = 'array');
--> statement-breakpoint

-- Yeni bildirim türleri telefon bildirimiyle de gider (karar #256). Liste Parametreler ekranından daha önce
-- kaydedildiyse türler listede yoktur; bir kez eklenir (sistem yöneticisi sonra ekrandan kaldırabilir).
-- E-posta listesine eklenmez: varsayılan olarak e-postayla gitmezler.
UPDATE settings
SET value = value || '["schedule_updated"]'::jsonb, updated_at = now()
WHERE key = 'notify.push_events'
  AND jsonb_typeof(value) = 'array'
  AND NOT (value @> '["schedule_updated"]'::jsonb);
--> statement-breakpoint
UPDATE settings
SET value = value || '["schedule_removed"]'::jsonb, updated_at = now()
WHERE key = 'notify.push_events'
  AND jsonb_typeof(value) = 'array'
  AND NOT (value @> '["schedule_removed"]'::jsonb);

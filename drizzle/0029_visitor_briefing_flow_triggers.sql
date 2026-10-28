-- =====================================================================
-- İş paketi 2.3a: ziyaretçi bilgilendirme — denetim, değiştirilemezlik, saklama
-- =====================================================================

SELECT app_attach_audit('visit_sessions', '{id}', '{token_hash}', 'INSERT OR DELETE');
--> statement-breakpoint
SELECT app_attach_audit('visit_quiz_attempts', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('visitor_consents', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('visitor_signatures', '{id}');
--> statement-breakpoint

-- Teslim edilen deneme donar; teslime kadar yalnızca cevaplar ve sonuç yazılır
SELECT app_attach_immutable('visit_quiz_attempts', '{items,score,passed}', 'submitted_at');
--> statement-breakpoint
SELECT app_attach_immutable('visitor_consents');
--> statement-breakpoint
SELECT app_attach_immutable('visitor_signatures');
--> statement-breakpoint

-- Ziyaretçi anonimleştirmesi (karar #134): onay ve imzadaki IP/cihaz ile imza görseli bağlantısı da silinir.
-- Görsel nesneleri worker, fonksiyondan önce okuduğu anahtarlarla depodan siler.
CREATE OR REPLACE FUNCTION app_anonymize_visitors(p_ids uuid[])
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids uuid[];
  v_txt text[];
BEGIN
  SELECT coalesce(array_agg(v.id), '{}')
    INTO v_ids
    FROM visitors v
   WHERE v.id = ANY(p_ids)
     AND v.anonymized_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM visits x WHERE x.visitor_id = v.id AND x.status IN ('briefed', 'checked_in'));
  IF cardinality(v_ids) = 0 THEN
    RETURN;
  END IF;
  v_txt := v_ids::text[];

  PERFORM set_config('app.retention_job', 'on', true);

  UPDATE visits SET note = NULL WHERE visitor_id = ANY(v_ids);
  DELETE FROM visit_sessions s USING visits x WHERE s.visit_id = x.id AND x.visitor_id = ANY(v_ids);
  UPDATE visitor_consents c SET ip = NULL, user_agent = NULL FROM visits x WHERE c.visit_id = x.id AND x.visitor_id = ANY(v_ids);
  UPDATE visitor_signatures SET ip = NULL, user_agent = NULL, image_key = NULL WHERE visitor_id = ANY(v_ids);
  UPDATE visitors v
     SET full_name = 'Anonim #' || upper(left(replace(v.id::text, '-', ''), 8)),
         phone = NULL,
         email = NULL,
         id_country = NULL,
         national_id_enc = NULL,
         national_id_hmac = NULL,
         national_id_masked = NULL,
         anonymized_at = now(),
         updated_at = now()
   WHERE v.id = ANY(v_ids);

  UPDATE audit_log
     SET old_data = app_mask_jsonb(old_data, '{full_name,phone,email,id_country,national_id_masked}'),
         new_data = app_mask_jsonb(new_data, '{full_name,phone,email,id_country,national_id_masked}')
   WHERE table_name = 'visitors' AND record_id = ANY(v_txt);
  UPDATE audit_log
     SET old_data = app_mask_jsonb(old_data, '{note}'),
         new_data = app_mask_jsonb(new_data, '{note}')
   WHERE table_name = 'visits' AND coalesce(new_data, old_data) ->> 'visitor_id' = ANY(v_txt);
  UPDATE audit_log l
     SET old_data = app_mask_jsonb(l.old_data, '{ip,user_agent,image_key}'),
         new_data = app_mask_jsonb(l.new_data, '{ip,user_agent,image_key}')
   WHERE l.table_name = 'visitor_signatures' AND coalesce(l.new_data, l.old_data) ->> 'visitor_id' = ANY(v_txt);
  UPDATE audit_log l
     SET old_data = app_mask_jsonb(l.old_data, '{ip,user_agent}'),
         new_data = app_mask_jsonb(l.new_data, '{ip,user_agent}')
    FROM visits x
   WHERE l.table_name = 'visitor_consents'
     AND coalesce(l.new_data, l.old_data) ->> 'visit_id' = x.id::text
     AND x.visitor_id = ANY(v_ids);

  PERFORM set_config('app.retention_job', 'off', true);
  RETURN QUERY SELECT unnest(v_ids);
END
$$;

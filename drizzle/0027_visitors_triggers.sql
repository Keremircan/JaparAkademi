-- =====================================================================
-- İş paketi 2.2: ziyaretçi temeli — denetim, değiştirilemezlik, saklama
-- =====================================================================

SELECT app_attach_audit('visitor_briefings', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('visitor_briefing_cards', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('visitor_briefing_questions', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('contractor_companies', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('visitors', '{id}', '{national_id_enc,national_id_hmac}');
--> statement-breakpoint
SELECT app_attach_audit('visits', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('blacklist_entries', '{id}', '{national_id_hmac}');
--> statement-breakpoint

-- Yayınlanan bilgilendirme paketi donar (karar #127); taslak silinebilir
SELECT app_attach_immutable('visitor_briefings', '{published_by,updated_at}', 'published_at');
--> statement-breakpoint

CREATE OR REPLACE FUNCTION visitor_briefing_child_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_briefing uuid;
  v_published timestamptz;
BEGIN
  v_briefing := CASE WHEN TG_OP = 'DELETE' THEN OLD.briefing_id ELSE NEW.briefing_id END;
  SELECT published_at INTO v_published FROM visitor_briefings WHERE id = v_briefing;
  IF v_published IS NOT NULL THEN
    RAISE EXCEPTION 'Yayınlanmış bilgilendirme paketi değiştirilemez: %', TG_TABLE_NAME
      USING ERRCODE = 'JA001', HINT = 'Yeni bir taslak sürüm açın.';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.briefing_id IS DISTINCT FROM OLD.briefing_id THEN
    RAISE EXCEPTION 'Paket bağlantısı değiştirilemez: %', TG_TABLE_NAME USING ERRCODE = 'JA001';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;
--> statement-breakpoint
CREATE TRIGGER published_guard BEFORE INSERT OR UPDATE OR DELETE ON visitor_briefing_cards
  FOR EACH ROW EXECUTE FUNCTION visitor_briefing_child_guard();
--> statement-breakpoint
CREATE TRIGGER published_guard BEFORE INSERT OR UPDATE OR DELETE ON visitor_briefing_questions
  FOR EACH ROW EXECUTE FUNCTION visitor_briefing_child_guard();
--> statement-breakpoint

-- Kara liste kaydı yalnızca eklenir; kaldırma bir kez yapılır (gerekçe + kişi, kilit lifted_at)
SELECT app_attach_immutable('blacklist_entries', '{lifted_reason,lifted_by}', 'lifted_at');
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- Saklama (karar #134): ziyaretçi ve kara liste anonimleştirmesi.
-- Seçim uygulamada yapılır; fonksiyonlar kişi verisini ve denetim kaydındaki karşılığını siler.
-- ---------------------------------------------------------------------

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
  -- İçeride olan (çıkışı yapılmamış) ziyaretçi anonimleştirilmez
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

  PERFORM set_config('app.retention_job', 'off', true);
  RETURN QUERY SELECT unnest(v_ids);
END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_anonymize_blacklist(p_ids uuid[])
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids uuid[];
  v_txt text[];
BEGIN
  -- Yalnızca kaldırılmış kayıtlar
  SELECT coalesce(array_agg(b.id), '{}')
    INTO v_ids
    FROM blacklist_entries b
   WHERE b.id = ANY(p_ids) AND b.lifted_at IS NOT NULL AND b.anonymized_at IS NULL;
  IF cardinality(v_ids) = 0 THEN
    RETURN;
  END IF;
  v_txt := v_ids::text[];

  PERFORM set_config('app.retention_job', 'on', true);

  UPDATE blacklist_entries b
     SET full_name_snapshot = 'Anonim #' || upper(left(replace(b.id::text, '-', ''), 8)),
         national_id_hmac = NULL,
         national_id_masked = NULL,
         anonymized_at = now()
   WHERE b.id = ANY(v_ids);
  UPDATE audit_log
     SET old_data = app_mask_jsonb(old_data, '{full_name_snapshot,national_id_masked}'),
         new_data = app_mask_jsonb(new_data, '{full_name_snapshot,national_id_masked}')
   WHERE table_name = 'blacklist_entries' AND record_id = ANY(v_txt);

  PERFORM set_config('app.retention_job', 'off', true);
  RETURN QUERY SELECT unnest(v_ids);
END
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION app_anonymize_visitors(uuid[]) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app_anonymize_blacklist(uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_anonymize_visitors(uuid[]) TO akademi_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_anonymize_blacklist(uuid[]) TO akademi_app;

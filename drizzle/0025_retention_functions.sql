-- =====================================================================
-- İş paketi 2.1: saklama süreleri (SPEC 12.3, kararlar #120–125)
-- Değiştirilemez tablolara yalnızca aşağıdaki iki fonksiyon dokunabilir:
--   app_anonymize_people(uuid[])  — süresi dolan ayrılmış personelin kişi verisini siler
--   app_purge_audit(timestamptz)  — saklama süresini geçen denetim kayıtlarını siler
-- Fonksiyonlar tablo sahibi rolüyle (SECURITY DEFINER) çalışır ve transaction'a özel
-- app.retention_job bayrağını açar. prevent_mutation() yalnızca bayrak açıkken VE
-- işlem tablo sahibi rolüyle yapılıyorsa izin verir; uygulama rolü (akademi_app)
-- bayrağı kendisi açsa bile tablo sahibi olamadığından engel sürer.
-- =====================================================================

CREATE OR REPLACE FUNCTION app_retention_exempt(p_rel oid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(current_setting('app.retention_job', true), '') = 'on'
     AND current_user = (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = p_rel)
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION prevent_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  allowed  text[] := coalesce(string_to_array(nullif(TG_ARGV[0], ''), ','), '{}');
  lock_col text   := nullif(TG_ARGV[1], '');
  v_old    jsonb;
  v_new    jsonb;
  changed  text[];
BEGIN
  -- Saklama işi (yalnızca yukarıdaki fonksiyonlar içinden)
  IF app_retention_exempt(TG_RELID) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  v_old := to_jsonb(OLD);

  IF TG_OP = 'DELETE' THEN
    IF lock_col IS NOT NULL AND coalesce(jsonb_typeof(v_old -> lock_col), 'null') = 'null' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Değiştirilemez kayıt silinemez: %', TG_TABLE_NAME
      USING ERRCODE = 'JA001', HINT = 'Düzeltme için corrections kaydı açın.';
  END IF;

  v_new := to_jsonb(NEW);
  SELECT coalesce(array_agg(k ORDER BY k), '{}')
    INTO changed
    FROM jsonb_object_keys(v_new) AS k
   WHERE v_new -> k IS DISTINCT FROM v_old -> k;

  IF cardinality(changed) = 0 THEN
    RETURN NEW;
  END IF;

  IF lock_col IS NOT NULL THEN
    IF coalesce(jsonb_typeof(v_old -> lock_col), 'null') <> 'null' THEN
      RAISE EXCEPTION 'Kilitlenmiş kayıt güncellenemez: % (%)', TG_TABLE_NAME, lock_col
        USING ERRCODE = 'JA001', HINT = 'Düzeltme için corrections kaydı açın.';
    END IF;
    allowed := allowed || lock_col;
  END IF;

  IF NOT (changed <@ allowed) THEN
    RAISE EXCEPTION 'Değiştirilemez kayıt güncellenemez: % (%)', TG_TABLE_NAME, array_to_string(changed, ', ')
      USING ERRCODE = 'JA001', HINT = 'Düzeltme için corrections kaydı açın.';
  END IF;

  RETURN NEW;
END
$$;
--> statement-breakpoint

-- Ayrılmış (terminated, end_date dolu) ve henüz anonimleştirilmemiş personeli anonimleştirir.
-- Süre hesabı uygulamada yapılır (retention.personnel_years_after_exit, org.timezone).
-- Sertifika snapshot'ları ve imza kayıtları korunur (karar #124); imza görselleri worker'da silinir.
CREATE OR REPLACE FUNCTION app_anonymize_people(p_user_ids uuid[])
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids  uuid[];
  v_txt  text[];
BEGIN
  SELECT coalesce(array_agg(p.user_id), '{}')
    INTO v_ids
    FROM personnel p
   WHERE p.user_id = ANY(p_user_ids)
     AND p.status = 'terminated'
     AND p.end_date IS NOT NULL
     AND p.anonymized_at IS NULL;
  IF cardinality(v_ids) = 0 THEN
    RETURN;
  END IF;
  v_txt := v_ids::text[];

  PERFORM set_config('app.retention_job', 'on', true);

  -- Oturum, giriş, roller ve bildirimler
  DELETE FROM email_outbox o
   USING personnel p
   WHERE p.user_id = ANY(v_ids) AND p.email IS NOT NULL AND lower(o.to_address) = lower(p.email);
  DELETE FROM notifications WHERE user_id = ANY(v_ids);
  DELETE FROM password_reset_tokens WHERE user_id = ANY(v_ids);
  DELETE FROM sessions WHERE user_id = ANY(v_ids);
  DELETE FROM accounts WHERE user_id = ANY(v_ids);
  DELETE FROM role_scopes WHERE user_id = ANY(v_ids);
  DELETE FROM user_roles WHERE user_id = ANY(v_ids);

  -- Değiştirilemez kayıtlardaki IP / cihaz / aktarım verisi
  UPDATE login_attempts SET ip = NULL, user_agent = NULL, sicil_input = 'ANON' WHERE user_id = ANY(v_ids);
  UPDATE exam_attempts a
     SET ip = NULL, user_agent = NULL
    FROM assignment_modules am
    JOIN assignments s ON s.id = am.assignment_id
   WHERE a.assignment_module_id = am.id AND s.user_id = ANY(v_ids);
  UPDATE consents SET ip = NULL, user_agent = NULL WHERE user_id = ANY(v_ids);
  UPDATE signatures SET ip = NULL, user_agent = NULL WHERE signer_user_id = ANY(v_ids);
  UPDATE import_rows SET data = '{}'::jsonb, sicil_no = NULL WHERE user_id = ANY(v_ids);

  -- Kimlik
  UPDATE personnel p
     SET full_name = 'Anonim #' || upper(left(replace(p.user_id::text, '-', ''), 8)),
         sicil_no = 'ANON-' || upper(left(replace(p.user_id::text, '-', ''), 8)),
         national_id_enc = NULL,
         national_id_hmac = NULL,
         national_id_masked = NULL,
         phone = NULL,
         email = NULL,
         locked_until = NULL,
         anonymized_at = now(),
         updated_at = now()
   WHERE p.user_id = ANY(v_ids);
  UPDATE users u
     SET name = 'Anonim #' || upper(left(replace(u.id::text, '-', ''), 8)),
         email = 'anon-' || u.id::text || '@anonim.invalid',
         username = 'anon-' || lower(left(replace(u.id::text, '-', ''), 8)),
         display_username = NULL,
         image = NULL,
         updated_at = now()
   WHERE u.id = ANY(v_ids);

  -- Denetim kaydındaki kişi verisi (yukarıdaki değişikliklerin kendi kayıtları dahil)
  UPDATE audit_log
     SET old_data = app_mask_jsonb(old_data, '{full_name,sicil_no,phone,email,national_id_masked}'),
         new_data = app_mask_jsonb(new_data, '{full_name,sicil_no,phone,email,national_id_masked}')
   WHERE table_name = 'personnel' AND record_id = ANY(v_txt);
  UPDATE audit_log
     SET old_data = app_mask_jsonb(old_data, '{name,email,username,display_username,image}'),
         new_data = app_mask_jsonb(new_data, '{name,email,username,display_username,image}')
   WHERE table_name = 'users' AND record_id = ANY(v_txt);
  UPDATE audit_log
     SET old_data = app_mask_jsonb(old_data, '{account_id}'),
         new_data = app_mask_jsonb(new_data, '{account_id}')
   WHERE table_name = 'accounts' AND coalesce(new_data, old_data) ->> 'user_id' = ANY(v_txt);
  UPDATE audit_log
     SET old_data = app_mask_jsonb(old_data, '{ip_address,user_agent}'),
         new_data = app_mask_jsonb(new_data, '{ip_address,user_agent}')
   WHERE table_name = 'sessions' AND coalesce(new_data, old_data) ->> 'user_id' = ANY(v_txt);
  UPDATE audit_log
     SET old_data = app_mask_jsonb(old_data, '{ip,user_agent}'),
         new_data = app_mask_jsonb(new_data, '{ip,user_agent}')
   WHERE table_name IN ('consents', 'password_reset_tokens')
     AND coalesce(new_data, old_data) ->> 'user_id' = ANY(v_txt);
  UPDATE audit_log
     SET old_data = app_mask_jsonb(old_data, '{ip,user_agent}'),
         new_data = app_mask_jsonb(new_data, '{ip,user_agent}')
   WHERE table_name = 'signatures' AND coalesce(new_data, old_data) ->> 'signer_user_id' = ANY(v_txt);
  UPDATE audit_log l
     SET old_data = app_mask_jsonb(l.old_data, '{ip,user_agent}'),
         new_data = app_mask_jsonb(l.new_data, '{ip,user_agent}')
    FROM exam_attempts a
    JOIN assignment_modules am ON am.id = a.assignment_module_id
    JOIN assignments s ON s.id = am.assignment_id
   WHERE l.table_name = 'exam_attempts' AND l.record_id = a.id::text AND s.user_id = ANY(v_ids);

  PERFORM set_config('app.retention_job', 'off', true);
  RETURN QUERY SELECT unnest(v_ids);
END
$$;
--> statement-breakpoint

-- Saklama süresini (retention.audit_years) geçen denetim kayıtlarını siler.
-- Güvenlik için son bir yılın kayıtları hiçbir koşulda silinemez.
CREATE OR REPLACE FUNCTION app_purge_audit(p_before timestamptz)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n bigint;
BEGIN
  IF p_before > now() - interval '1 year' THEN
    RAISE EXCEPTION 'Son bir yılın denetim kaydı silinemez' USING ERRCODE = 'JA001';
  END IF;
  PERFORM set_config('app.retention_job', 'on', true);
  DELETE FROM audit_log WHERE at < p_before;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('app.retention_job', 'off', true);
  RETURN n;
END
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION app_anonymize_people(uuid[]) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app_purge_audit(timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_anonymize_people(uuid[]) TO akademi_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_purge_audit(timestamptz) TO akademi_app;

-- Anonim kimlik çakışması düzeltmesi (karar #268).
-- Kimlikler UUIDv7: ilk 8 onaltılık karakter zaman damgasıdır, aynı dakikada açılan kişilerde aynıdır
-- (Excel aktarımı, toplu hesap açma). Eski "ANON-<ilk 8>" sicili ve "anon-<ilk 8>" kullanıcı adı benzersiz
-- kısıta takılıyor, gece saklama işi ve kalıcı silme hata veriyordu. Artık:
--   sicil       ANON-<son 12>  (rastgele kısım)
--   kullanıcı   anon-<kimliğin tamamı>  (kesin benzersiz; ekranda görünmez)
--   ad          Anonim #<son 8>  (sicilin son 8 karakteri)
-- Daha önce anonimleştirilmiş kayıtlar değişmez (farklı uzunluk, çakışmaz). Fonksiyonun geri kalanı 0025 ile aynıdır.
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
     SET full_name = 'Anonim #' || upper(right(replace(p.user_id::text, '-', ''), 8)),
         sicil_no = 'ANON-' || upper(right(replace(p.user_id::text, '-', ''), 12)),
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
     SET name = 'Anonim #' || upper(right(replace(u.id::text, '-', ''), 8)),
         email = 'anon-' || u.id::text || '@anonim.invalid',
         username = 'anon-' || replace(u.id::text, '-', ''),
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

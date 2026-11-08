-- İş paketi 3.14 (karar #285): geçmişi olmayan personeli silme.
-- Hiç eğitim, sınav, onay, KVKK onayı ya da başka geçmiş kaydı olmayan kişi (ör. yanlış açılmış ya da yanlış
-- aktarılmış hesap) gerçekten silinir. Uygulama önce dokunulmamış atamaları ve çalışma programı verisini siler,
-- sonra bu fonksiyonu çağırır. Kişiye bağlı bir geçmiş kaydı (FK, restrict) kalmışsa DELETE hata verir ve
-- uygulama tarafındaki ara kayıt noktası geri alınır: kişi silinmez.
--
-- Değiştirilemez iki kayıt kişiden ayrılır (kayıt kalır, kişi verisi silinir): Excel aktarım satırı ve giriş
-- denemesi. Bunlar için saklama işinin bayrağı (app.retention_job) yalnızca o güncellemelerde açılır.
-- Denetim kaydındaki kişi verisi (silme satırları dahil) anonimleştirmedekiyle aynı biçimde maskelenir.
CREATE OR REPLACE FUNCTION app_delete_people(p_user_ids uuid[])
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
     AND p.anonymized_at IS NULL;
  IF cardinality(v_ids) = 0 THEN
    RETURN;
  END IF;
  v_txt := v_ids::text[];

  -- Değiştirilemez kayıtlardaki bağ
  PERFORM set_config('app.retention_job', 'on', true);
  UPDATE import_rows SET user_id = NULL, data = '{}'::jsonb, sicil_no = NULL WHERE user_id = ANY(v_ids);
  UPDATE login_attempts SET user_id = NULL, ip = NULL, user_agent = NULL, sicil_input = 'ANON' WHERE user_id = ANY(v_ids);
  PERFORM set_config('app.retention_job', 'off', true);

  -- Kişiye ait kayıtlar ve kimlik (oturum, hesap, şifre sıfırlama ve push kayıtları users ile birlikte silinir)
  DELETE FROM email_outbox o
   USING personnel p
   WHERE p.user_id = ANY(v_ids) AND p.email IS NOT NULL AND lower(o.to_address) = lower(p.email);
  DELETE FROM notifications WHERE user_id = ANY(v_ids);
  DELETE FROM account_invitations WHERE user_id = ANY(v_ids);
  DELETE FROM role_scopes WHERE user_id = ANY(v_ids);
  DELETE FROM user_roles WHERE user_id = ANY(v_ids);
  UPDATE org_units SET responsible_user_id = NULL WHERE responsible_user_id = ANY(v_ids);
  DELETE FROM personnel WHERE user_id = ANY(v_ids);
  DELETE FROM users WHERE id = ANY(v_ids);

  -- Denetim kaydındaki kişi verisi
  PERFORM set_config('app.retention_job', 'on', true);
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
   WHERE table_name = 'password_reset_tokens' AND coalesce(new_data, old_data) ->> 'user_id' = ANY(v_txt);
  PERFORM set_config('app.retention_job', 'off', true);

  RETURN QUERY SELECT unnest(v_ids);
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app_delete_people(uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_delete_people(uuid[]) TO akademi_app;

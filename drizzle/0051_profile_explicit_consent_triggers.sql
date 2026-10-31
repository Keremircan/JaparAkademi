-- Profil ve açık rıza (iş paketi 3.4, kararlar #230–236)

-- Açık rıza kararı değiştirilemez; geri alma yeni kayıttır. IP ve tarayıcı denetim kaydına maskeli yazılır.
SELECT app_attach_audit('explicit_consents', '{id}', '{ip,user_agent}');
--> statement-breakpoint
SELECT app_attach_immutable('explicit_consents');
--> statement-breakpoint

-- Anonimleştirilen personelin açık rıza kayıtlarındaki IP / tarayıcı (app_anonymize_people'dan sonra çağrılır)
CREATE OR REPLACE FUNCTION app_anonymize_explicit_consents(p_user_ids uuid[])
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids uuid[];
  n bigint;
BEGIN
  SELECT coalesce(array_agg(p.user_id), '{}')
    INTO v_ids
    FROM personnel p
   WHERE p.user_id = ANY(p_user_ids) AND p.anonymized_at IS NOT NULL;
  IF cardinality(v_ids) = 0 THEN
    RETURN 0;
  END IF;
  PERFORM set_config('app.retention_job', 'on', true);
  UPDATE explicit_consents SET ip = NULL, user_agent = NULL
   WHERE user_id = ANY(v_ids) AND (ip IS NOT NULL OR user_agent IS NOT NULL);
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('app.retention_job', 'off', true);
  RETURN n;
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app_anonymize_explicit_consents(uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_anonymize_explicit_consents(uuid[]) TO akademi_app;

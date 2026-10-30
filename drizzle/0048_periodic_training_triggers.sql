-- Eski personelin periyodik eğitimleri (iş paketi 3.2, kararlar #222–225)

ALTER TABLE "assignment_modules" ADD CONSTRAINT "assignment_modules_renews_prior_id_prior_trainings_id_fk" FOREIGN KEY ("renews_prior_id") REFERENCES "public"."prior_trainings"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

-- Son eğitim tarihi kaydı değiştirilemez; düzeltme yeni kayıtla yapılır
SELECT app_attach_audit('prior_trainings', '{id}');
--> statement-breakpoint
SELECT app_attach_immutable('prior_trainings');
--> statement-breakpoint

-- Anonimleştirilen personelin son eğitim kayıtlarındaki not (app_anonymize_people'dan sonra çağrılır)
CREATE OR REPLACE FUNCTION app_anonymize_prior_trainings(p_user_ids uuid[])
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
  UPDATE prior_trainings SET note = NULL WHERE user_id = ANY(v_ids) AND note IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE audit_log
     SET old_data = app_mask_jsonb(old_data, '{note}'),
         new_data = app_mask_jsonb(new_data, '{note}')
   WHERE table_name = 'prior_trainings' AND coalesce(new_data, old_data) ->> 'user_id' = ANY(v_ids::text[]);
  PERFORM set_config('app.retention_job', 'off', true);
  RETURN n;
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app_anonymize_prior_trainings(uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_anonymize_prior_trainings(uuid[]) TO akademi_app;

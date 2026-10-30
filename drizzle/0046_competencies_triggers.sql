-- Yetkinlik matrisi (iş paketi 3.1, kararlar #218–221)

-- Pratik görev → yetkinlik (şema dosyaları arasında döngü olmaması için FK burada)
ALTER TABLE "practice_tasks" ADD CONSTRAINT "practice_tasks_competency_id_competencies_id_fk" FOREIGN KEY ("competency_id") REFERENCES "public"."competencies"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_tasks_competency_idx" ON "practice_tasks" ("competency_id");
--> statement-breakpoint

-- Elle verilen yetkinlikte gerekçe ve veren zorunlu; geri almada gerekçe ve geri alan zorunlu
ALTER TABLE "competency_grants" ADD CONSTRAINT "competency_grants_manual_check"
  CHECK ("source"::text <> 'manual' OR ("reason" IS NOT NULL AND "granted_by" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "competency_grants" ADD CONSTRAINT "competency_grants_revoke_check"
  CHECK ("revoked_at" IS NULL OR ("revoke_reason" IS NOT NULL AND "revoked_by" IS NOT NULL));
--> statement-breakpoint

-- Yetkinlik kaydı değiştirilemez; yalnızca bir kez geri alınabilir (kilit revoked_at)
SELECT app_attach_immutable('competency_grants', '{revoked_by,revoke_reason}', 'revoked_at');
--> statement-breakpoint

-- Anonimleştirilen personelin yetkinlik gerekçeleri (app_anonymize_people'dan sonra çağrılır)
CREATE OR REPLACE FUNCTION app_anonymize_competency_grants(p_user_ids uuid[])
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
  UPDATE competency_grants
     SET reason = CASE WHEN reason IS NULL THEN NULL ELSE 'ANON' END,
         revoke_reason = CASE WHEN revoke_reason IS NULL THEN NULL ELSE 'ANON' END
   WHERE user_id = ANY(v_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE audit_log
     SET old_data = app_mask_jsonb(old_data, '{reason,revoke_reason}'),
         new_data = app_mask_jsonb(new_data, '{reason,revoke_reason}')
   WHERE table_name = 'competency_grants' AND coalesce(new_data, old_data) ->> 'user_id' = ANY(v_ids::text[]);
  PERFORM set_config('app.retention_job', 'off', true);
  RETURN n;
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app_anonymize_competency_grants(uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_anonymize_competency_grants(uuid[]) TO akademi_app;

-- =====================================================================
-- İş paketi 1.5: soru bankası ve teorik sınav trigger'ları
-- =====================================================================

SELECT app_attach_audit('questions', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('question_versions', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('question_modules', '{question_id,module_id}');
--> statement-breakpoint
SELECT app_attach_audit('proctor_sessions', '{id}', '{code_hash}');
--> statement-breakpoint
SELECT app_attach_audit('proctor_code_failures', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('exam_attempts', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('exam_attempt_items', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('exam_attempt_events', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('attempt_grants', '{id}');
--> statement-breakpoint

-- Teslim edilen deneme değiştirilemez; teslimden önce yalnızca sonuç ve izleme alanları güncellenir
SELECT app_attach_immutable(
  'exam_attempts',
  '{tts_used,tab_leave_count,submit_reason,score,passed,fail_reason}',
  'submitted_at'
);
--> statement-breakpoint
SELECT app_attach_immutable('exam_attempt_events');
--> statement-breakpoint
SELECT app_attach_immutable('attempt_grants');
--> statement-breakpoint
SELECT app_attach_immutable('proctor_code_failures');
--> statement-breakpoint

-- Deneme sorusu: teslimden sonra değişmez; öncesinde yalnızca cevap alanları değişir
CREATE OR REPLACE FUNCTION exam_attempt_item_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_submitted timestamptz;
BEGIN
  SELECT submitted_at INTO v_submitted FROM exam_attempts
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.attempt_id ELSE NEW.attempt_id END;
  IF v_submitted IS NOT NULL THEN
    RAISE EXCEPTION 'Teslim edilmiş sınav denemesi değiştirilemez' USING ERRCODE = 'JA001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Deneme sorusu silinemez' USING ERRCODE = 'JA001';
  END IF;
  IF TG_OP = 'UPDATE' AND (
       NEW.attempt_id IS DISTINCT FROM OLD.attempt_id OR NEW.sort_order IS DISTINCT FROM OLD.sort_order
    OR NEW.question_version_id IS DISTINCT FROM OLD.question_version_id OR NEW.option_order IS DISTINCT FROM OLD.option_order
  ) THEN
    RAISE EXCEPTION 'Deneme sorusu değiştirilemez' USING ERRCODE = 'JA001';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;
--> statement-breakpoint
CREATE TRIGGER submitted_guard BEFORE INSERT OR UPDATE OR DELETE ON exam_attempt_items
  FOR EACH ROW EXECUTE FUNCTION exam_attempt_item_guard();
--> statement-breakpoint

-- Sınavda kullanılmış soru sürümü değiştirilemez ve silinemez; yalnızca kullanımdan kaldırılabilir (status → retired)
CREATE OR REPLACE FUNCTION question_version_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  changed text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM exam_attempt_items WHERE question_version_id = OLD.id) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Sınavda kullanılmış soru sürümü silinemez' USING ERRCODE = 'JA001';
  END IF;
  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);
  SELECT coalesce(array_agg(k), '{}') INTO changed
    FROM jsonb_object_keys(v_new) AS k
   WHERE v_new -> k IS DISTINCT FROM v_old -> k;
  IF NOT (changed <@ ARRAY['status', 'updated_at']) THEN
    RAISE EXCEPTION 'Sınavda kullanılmış soru sürümü değiştirilemez (%); yeni sürüm açın', array_to_string(changed, ', ')
      USING ERRCODE = 'JA001';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER used_guard BEFORE UPDATE OR DELETE ON question_versions
  FOR EACH ROW EXECUTE FUNCTION question_version_guard();

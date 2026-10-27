-- =====================================================================
-- İş paketi 1.6: pratik eğitim ve pratik sınav trigger'ları
-- =====================================================================

SELECT app_attach_audit('practice_marks', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('signatures', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('practical_exam_results', '{id}');
--> statement-breakpoint

-- İşaretleme ve imza yalnızca eklenir (FG-5.2, SPEC Bölüm 7)
SELECT app_attach_immutable('practice_marks');
--> statement-breakpoint
SELECT app_attach_immutable('signatures');
--> statement-breakpoint

-- Pratik sınav formu: 2. imza ya da geri gönderme (finalized_at) sonrası hiçbir alan değişmez
SELECT app_attach_immutable(
  'practical_exam_results',
  '{status,criteria,score,passed,fail_reason,photo_asset_ids,note,evaluator_id,trainee_signature_id,trainer_signature_id,submitted_at,manager_user_id,manager_signature_id,return_reason,updated_at}',
  'finalized_at'
);
--> statement-breakpoint

-- 1. imzadan (submitted_at) sonra değerlendirme alanları kilitlenir; yalnızca 2. imza / geri gönderme alanları değişir.
-- İmzalanmış form silinemez (taslak silinebilir).
CREATE OR REPLACE FUNCTION practical_exam_signed_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.submitted_at IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'İmzalanmış pratik sınav formu silinemez' USING ERRCODE = 'JA001';
  END IF;
  IF NEW.criteria IS DISTINCT FROM OLD.criteria OR NEW.score IS DISTINCT FROM OLD.score
     OR NEW.passed IS DISTINCT FROM OLD.passed OR NEW.fail_reason IS DISTINCT FROM OLD.fail_reason
     OR NEW.photo_asset_ids IS DISTINCT FROM OLD.photo_asset_ids OR NEW.note IS DISTINCT FROM OLD.note
     OR NEW.evaluator_id IS DISTINCT FROM OLD.evaluator_id OR NEW.trainee_signature_id IS DISTINCT FROM OLD.trainee_signature_id
     OR NEW.trainer_signature_id IS DISTINCT FROM OLD.trainer_signature_id OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
     OR NEW.pass_score IS DISTINCT FROM OLD.pass_score THEN
    RAISE EXCEPTION 'İmzalanmış pratik sınav değerlendirmesi değiştirilemez' USING ERRCODE = 'JA001';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER signed_guard BEFORE UPDATE OR DELETE ON practical_exam_results
  FOR EACH ROW EXECUTE FUNCTION practical_exam_signed_guard();

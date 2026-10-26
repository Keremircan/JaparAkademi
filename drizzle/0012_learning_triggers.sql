-- =====================================================================
-- İş paketi 1.4: atama, teorik eğitim, ara değerlendirme, okuma görevi, sınıf eğitimi, cihaz trigger'ları
-- =====================================================================

SELECT app_attach_audit('assignments', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('assignment_modules', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('assignment_items', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('quiz_questions', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('quiz_responses', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('reread_tasks', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('classroom_sessions', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('classroom_attendees', '{session_id,user_id}');
--> statement-breakpoint
SELECT app_attach_audit('devices', '{id}', '{token_hash}');
--> statement-breakpoint

-- "Okudum, anladım" onayı verilen adım değiştirilemez; öncesinde yalnızca ilerleme alanları güncellenir
SELECT app_attach_immutable(
  'assignment_items',
  '{started_at,watched_ranges,progress_ratio,reached_end_at,updated_at}',
  'acknowledged_at'
);
--> statement-breakpoint

-- Ara değerlendirme cevapları değiştirilemez
SELECT app_attach_immutable('quiz_responses');
--> statement-breakpoint

-- Okuma görevi onaylanınca değiştirilemez
SELECT app_attach_immutable('reread_tasks', '{}', 'acknowledged_at');
--> statement-breakpoint

-- Onaylanan sınıf eğitimi kaydı değiştirilemez
SELECT app_attach_immutable(
  'classroom_sessions',
  '{module_id,trainer_user_id,session_date,duration_min,location,scanned_form_asset_id,notes,status,submitted_at,updated_at}',
  'approved_at'
);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION classroom_attendee_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_approved timestamptz;
BEGIN
  SELECT approved_at INTO v_approved FROM classroom_sessions
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.session_id ELSE NEW.session_id END;
  IF v_approved IS NOT NULL THEN
    RAISE EXCEPTION 'Onaylanmış sınıf eğitimi katılımcıları değiştirilemez' USING ERRCODE = 'JA001';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;
--> statement-breakpoint
CREATE TRIGGER approved_guard BEFORE INSERT OR UPDATE OR DELETE ON classroom_attendees
  FOR EACH ROW EXECUTE FUNCTION classroom_attendee_guard();

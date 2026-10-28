-- =====================================================================
-- İş paketi 2.4: tahliye yoklaması — denetim ve değiştirilemezlik
-- =====================================================================

SELECT app_attach_audit('evacuation_rollcalls', '{id}');
--> statement-breakpoint
SELECT app_attach_audit('evacuation_marks', '{id}');
--> statement-breakpoint

-- Yoklama bitince (ended_at) donar ve silinemez
SELECT app_attach_immutable('evacuation_rollcalls', '{ended_by}', 'ended_at');
--> statement-breakpoint

-- İşaretler yoklama açıkken değişebilir (geri alma dahil, karar #158); yoklama bitince donar
CREATE OR REPLACE FUNCTION evacuation_mark_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_rollcall uuid;
  v_ended timestamptz;
BEGIN
  v_rollcall := CASE WHEN TG_OP = 'DELETE' THEN OLD.rollcall_id ELSE NEW.rollcall_id END;
  SELECT ended_at INTO v_ended FROM evacuation_rollcalls WHERE id = v_rollcall;
  IF v_ended IS NOT NULL THEN
    RAISE EXCEPTION 'Bitmiş yoklama değiştirilemez: %', TG_TABLE_NAME USING ERRCODE = 'JA001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Yoklama kaydı silinemez' USING ERRCODE = 'JA001';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.rollcall_id IS DISTINCT FROM OLD.rollcall_id OR NEW.visit_id IS DISTINCT FROM OLD.visit_id) THEN
    RAISE EXCEPTION 'Yoklama bağlantısı değiştirilemez' USING ERRCODE = 'JA001';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;
--> statement-breakpoint
CREATE TRIGGER rollcall_guard BEFORE INSERT OR UPDATE OR DELETE ON evacuation_marks
  FOR EACH ROW EXECUTE FUNCTION evacuation_mark_guard();

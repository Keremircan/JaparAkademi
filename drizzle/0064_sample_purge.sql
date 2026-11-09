-- =====================================================================
-- Örnek veri (kararlar #296–297)
-- sample_records: yükleyicinin oluşturduğu kök kayıtlar. Uygulama rolü yalnızca okur ve ekler.
-- Temizleme komutu tablo sahibi rolüyle (akademi_owner) bağlanır ve transaction'a özel
-- app.retention_job bayrağını açar; değiştirilemezlik trigger'ları (prevent_mutation,
-- visit_gate_guard) bu durumda zaten izin verir. Aşağıdaki koruma trigger'ları da aynı
-- istisnaya bağlanır. Uygulama rolü tablo sahibi olamadığından istisna onun için kapalı kalır.
-- =====================================================================

SELECT app_attach_audit('sample_records', '{id}');
--> statement-breakpoint
REVOKE UPDATE, DELETE ON sample_records FROM akademi_app;
--> statement-breakpoint

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('certificates', 'certificate_guard', 'DELETE OR UPDATE', 'certificate_guard'),
      ('classroom_attendees', 'approved_guard', 'INSERT OR DELETE OR UPDATE', 'classroom_attendee_guard'),
      ('content_version_assets', 'published_guard', 'INSERT OR DELETE OR UPDATE', 'content_version_child_guard'),
      ('content_version_locales', 'published_guard', 'INSERT OR DELETE OR UPDATE', 'content_version_child_guard'),
      ('evacuation_marks', 'rollcall_guard', 'INSERT OR DELETE OR UPDATE', 'evacuation_mark_guard'),
      ('exam_attempt_items', 'submitted_guard', 'INSERT OR DELETE OR UPDATE', 'exam_attempt_item_guard'),
      ('plan_modules', 'published_guard', 'INSERT OR DELETE OR UPDATE', 'training_plan_guard'),
      ('practical_exam_results', 'signed_guard', 'DELETE OR UPDATE', 'practical_exam_signed_guard'),
      ('question_versions', 'used_guard', 'DELETE OR UPDATE', 'question_version_guard'),
      ('training_plans', 'published_guard', 'INSERT OR DELETE OR UPDATE', 'training_plan_guard'),
      ('visitor_briefing_cards', 'published_guard', 'INSERT OR DELETE OR UPDATE', 'visitor_briefing_child_guard'),
      ('visitor_briefing_questions', 'published_guard', 'INSERT OR DELETE OR UPDATE', 'visitor_briefing_child_guard')
    ) AS t(tbl, trg, events, fn)
  LOOP
    EXECUTE format('DROP TRIGGER %I ON %I', r.trg, r.tbl);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE %s ON %I FOR EACH ROW WHEN (NOT app_retention_exempt(%L::regclass)) EXECUTE FUNCTION %I()',
      r.trg, r.events, r.tbl, r.tbl, r.fn
    );
  END LOOP;
END
$$;

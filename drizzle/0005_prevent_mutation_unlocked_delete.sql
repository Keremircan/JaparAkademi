-- =====================================================================
-- prevent_mutation(): kilit sütunlu tablolarda, kilit henüz dolmamışken satır silinebilir.
-- Örn. onaylanmamış Excel aktarım satırları (import_rows) ve yayınlanmamış KVKK taslakları.
-- Kilit sütunu olmayan tablolarda silme her zaman yasaktır (değişmedi).
-- =====================================================================

CREATE OR REPLACE FUNCTION prevent_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  allowed  text[] := coalesce(string_to_array(nullif(TG_ARGV[0], ''), ','), '{}');
  lock_col text   := nullif(TG_ARGV[1], '');
  v_old    jsonb;
  v_new    jsonb;
  changed  text[];
BEGIN
  v_old := to_jsonb(OLD);

  IF TG_OP = 'DELETE' THEN
    IF lock_col IS NOT NULL AND coalesce(jsonb_typeof(v_old -> lock_col), 'null') = 'null' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Değiştirilemez kayıt silinemez: %', TG_TABLE_NAME
      USING ERRCODE = 'JA001', HINT = 'Düzeltme için corrections kaydı açın.';
  END IF;

  v_new := to_jsonb(NEW);
  SELECT coalesce(array_agg(k ORDER BY k), '{}')
    INTO changed
    FROM jsonb_object_keys(v_new) AS k
   WHERE v_new -> k IS DISTINCT FROM v_old -> k;

  IF cardinality(changed) = 0 THEN
    RETURN NEW;
  END IF;

  IF lock_col IS NOT NULL THEN
    IF coalesce(jsonb_typeof(v_old -> lock_col), 'null') <> 'null' THEN
      RAISE EXCEPTION 'Kilitlenmiş kayıt güncellenemez: % (%)', TG_TABLE_NAME, lock_col
        USING ERRCODE = 'JA001', HINT = 'Düzeltme için corrections kaydı açın.';
    END IF;
    allowed := allowed || lock_col;
  END IF;

  IF NOT (changed <@ allowed) THEN
    RAISE EXCEPTION 'Değiştirilemez kayıt güncellenemez: % (%)', TG_TABLE_NAME, array_to_string(changed, ', ')
      USING ERRCODE = 'JA001', HINT = 'Düzeltme için corrections kaydı açın.';
  END IF;

  RETURN NEW;
END
$$;

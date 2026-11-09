ALTER TABLE "positions" ADD COLUMN "shifts" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_shifts_check" CHECK (array_to_string("positions"."shifts", ',') ~ '^(([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9](,([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9])*)?$');--> statement-breakpoint
-- Eski serbest metindeki saat aralıkları vardiyaya çevrilir ("08.00 - 18.00" → "08:00-18:00"); diğer yazılar
-- (ör. "3 vardiya") taşınmaz, sütunla birlikte kalkar (karar #291). Yayınlanmış kartların künyesi kendi kaydında kalır.
UPDATE "positions" p
SET "shifts" = x.shifts
FROM (
  SELECT id, array_agg(v ORDER BY first) AS shifts
  FROM (
    SELECT p2.id, lpad(r.m[1], 2, '0') || ':' || r.m[2] || '-' || lpad(r.m[3], 2, '0') || ':' || r.m[4] AS v, min(r.n) AS first
    FROM "positions" p2
    CROSS JOIN LATERAL regexp_matches(p2."shift_pattern", '(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})', 'g') WITH ORDINALITY AS r(m, n)
    WHERE r.m[1]::int < 24 AND r.m[3]::int < 24 AND r.m[2]::int < 60 AND r.m[4]::int < 60
      AND (r.m[1]::int <> r.m[3]::int OR r.m[2] <> r.m[4])
    GROUP BY p2.id, 2
  ) y
  GROUP BY id
) x
WHERE p.id = x.id;--> statement-breakpoint
ALTER TABLE "positions" DROP COLUMN "shift_pattern";

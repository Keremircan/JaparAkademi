import postgres from "postgres";

/**
 * Örnek veriyi temizler (karar #296).
 *
 * Kök kayıtlar `sample_records` tablosundadır. Her kökten başlayarak ona yabancı anahtarla bağlı bütün satırlar
 * (alt kayıtlar) bulunur. Bir kökün alt kayıtlarından biri gerçek bir kişiye ya da ziyaretçiye aitse (ör. gerçek
 * bir personelin ataması örnek kart sürümünü kullanıyorsa) ya da silinmeyecek bir kayda bağlıysa (ör. örnek içerik
 * gerçek bir modüle eklenmişse) o kök silinmez, raporlanır. Kalan kökler ve alt kayıtları tek transaction'da
 * silinir; parametre listelerine eklenen öğeler çıkarılır. Dosyalar depodan transaction bittikten sonra silinir.
 *
 * Bağlantı tablo sahibi rolüyle (akademi_owner) yapılır ve app.retention_job bayrağı açılır: değiştirilemez
 * kayıtlar da yalnızca bu yolla silinebilir (migration 0064).
 */

type Sql = postgres.Sql | postgres.TransactionSql;

type ForeignKey = { child: string; childCols: string[]; parent: string; parentCols: string[]; nullable: boolean };

type Schema = { fks: ForeignKey[]; pks: Map<string, string[]> };

/** Satır bir kişiye bu sütunlarla ait olur (oluşturan/onaylayan gibi sütunlar sahiplik sayılmaz). */
const SUBJECT_USER_COLUMNS = new Set(["user_id", "signer_user_id", "subject_user_id"]);
const SUBJECT_VISITOR_COLUMNS = new Set(["visitor_id"]);
/** Kurumun yapısı ve sistem tabloları: bunlara hiçbir koşulda dokunulmaz. */
const PROTECTED_TABLES = new Set(["org_units", "positions", "settings", "tag_types", "sample_records", "audit_log"]);
/** Ortak sözlük tabloları: örnek bir kaydın bunlardan birine bağlanması (ör. var olan etiket) o kaydı korumaz. */
const VOCABULARY_TABLES = new Set(["tags"]);
/** Yabancı anahtarı olmayan (tür + kimlik) bağlar. */
const POLYMORPHIC: { table: string; column: string }[] = [
  { table: "approvals", column: "subject_id" },
  { table: "owner_actions", column: "subject_id" },
  { table: "signatures", column: "subject_id" },
];
/** Medya kimliği tutan dizi sütunları. */
const MEDIA_ARRAYS = [
  ["practice_marks", "photo_asset_ids"],
  ["practical_exam_results", "photo_asset_ids"],
] as const;
/**
 * Kullanım bağları: satır bağlandığı kaydı yalnızca kullanır, onun parçası değildir (ör. modül içeriği listeler,
 * soru sürümü bir görsel kullanır). Korunan bir kaydın ayakta kalması için bu bağlarla bağlanan satırlar gerekmez.
 * Listede olmayan bağ "parça" sayılır; eksik bırakılan bir bağ yalnızca fazladan korumaya yol açar.
 */
const ITEM_EDGES = new Set([
  "assignment_items.card_version_id",
  "assignment_items.content_id",
  "assignment_items.content_version_id",
  "assignment_modules.module_id",
  "assignment_modules.renews_id",
  "assignment_modules.renews_prior_id",
  "assignments.card_version_id",
  "assignments.plan_id",
  "certificates.pdf_asset_id",
  "classroom_sessions.module_id",
  "classroom_sessions.scanned_form_asset_id",
  "competency_grants.certificate_id",
  "competency_grants.competency_id",
  "consents.legal_text_id",
  "content_tags.tag_id",
  "content_version_assets.asset_id",
  "contents.current_published_version_id",
  "contractor_clearances.visit_id",
  "decision_records.exam_module_id",
  "evacuation_marks.visit_id",
  "exam_attempt_items.question_version_id",
  "exam_attempts.proctor_session_id",
  "explicit_consents.legal_text_id",
  "module_contents.content_id",
  "personal_schedules.schedule_id",
  "personnel.photo_asset_id",
  "plan_modules.module_id",
  "practical_exam_results.manager_signature_id",
  "practical_exam_results.trainee_signature_id",
  "practical_exam_results.trainer_signature_id",
  "practice_marks.exam_result_id",
  "practice_marks.practice_task_id",
  "practice_tasks.competency_id",
  "prior_trainings.module_id",
  "question_modules.question_id",
  "question_versions.media_asset_id",
  "questions.current_version_id",
  "quiz_responses.quiz_question_id",
  "reread_tasks.content_id",
  "reread_tasks.content_version_id",
  "schedule_choices.schedule_id",
  "signatures.image_asset_id",
  "visit_denials.blacklist_entry_id",
  "visit_quiz_attempts.briefing_id",
  "visitor_briefing_cards.media_asset_id",
  "visitor_consents.legal_text_id",
  "visitors.contractor_company_id",
  "visits.briefing_id",
]);

export type PurgeReport = {
  dryRun: boolean;
  roots: number;
  deleted: Record<string, number>;
  kept: { table: string; id: string; reason: string }[];
  settingsReverted: { key: string; item: unknown }[];
  storageKeys: string[];
  mediaPrefixes: string[];
};

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class Rollback extends Error {}

export async function purgeSampleData(opts: {
  ownerUrl: string;
  dryRun?: boolean;
  log?: (line: string) => void;
  /** Depodan silme: tek tek anahtarlar ve önekler. */
  deleteObjects?: (keys: string[], prefixes: string[]) => Promise<void>;
}): Promise<PurgeReport> {
  const log = opts.log ?? (() => {});
  const client = postgres(opts.ownerUrl, { max: 1, onnotice: () => {}, connection: { application_name: "japar-akademi-sample-purge" } });
  let report: PurgeReport | null = null;
  try {
    await client
      .begin(async (tx) => {
        await tx.unsafe(`set local lock_timeout = '15s'`);
        await tx.unsafe(
          `select set_config('app.retention_job', 'on', true), set_config('app.actor_id', '', true), set_config('app.request_id', 'system:sample-purge', true)`,
        );
        const planned = await plan(tx, log);
        report = planned.report;
        if (opts.dryRun) {
          report.dryRun = true;
          throw new Rollback();
        }
        await execute(tx, planned, log);
      })
      .catch((err) => {
        if (!(err instanceof Rollback)) throw err;
      });
  } finally {
    await client.end({ timeout: 5 });
  }
  const r = report as PurgeReport | null;
  if (!r) throw new Error("Temizleme planı oluşturulamadı");
  if (!r.dryRun && opts.deleteObjects && (r.storageKeys.length || r.mediaPrefixes.length)) {
    await opts.deleteObjects(r.storageKeys, r.mediaPrefixes);
  }
  return r;
}

// ---------------------------------------------------------------------------
// Şema ve yardımcılar
// ---------------------------------------------------------------------------

type Marks = Map<string, Set<string>>;

async function loadSchema(tx: Sql): Promise<Schema> {
  const fkRows = await tx.unsafe<{ child: string; child_cols: string[]; parent: string; parent_cols: string[]; nullable: boolean }[]>(`
    select c.conrelid::regclass::text as child,
      array(select a.attname::text from unnest(c.conkey) with ordinality k(n, i) join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n order by k.i) as child_cols,
      c.confrelid::regclass::text as parent,
      array(select a.attname::text from unnest(c.confkey) with ordinality k(n, i) join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.n order by k.i) as parent_cols,
      not exists (select 1 from pg_attribute a where a.attrelid = c.conrelid and a.attnum = any(c.conkey) and a.attnotnull) as nullable
    from pg_constraint c
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace`);
  const fks = fkRows.map((r) => ({ child: r.child, childCols: r.child_cols, parent: r.parent, parentCols: r.parent_cols, nullable: r.nullable }));
  const pkRows = await tx.unsafe<{ tbl: string; cols: string[] }[]>(`
    select i.indrelid::regclass::text as tbl,
      array(select a.attname::text from unnest(i.indkey) with ordinality k(n, o) join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.n order by k.o) as cols
    from pg_index i join pg_class c on c.oid = i.indrelid
    where i.indisprimary and c.relnamespace = 'public'::regnamespace`);
  return { fks, pks: new Map(pkRows.map((r) => [r.tbl, r.cols])) };
}

function keyExpr(pks: Map<string, string[]>, table: string, alias: string): string {
  const cols = pks.get(table);
  if (!cols?.length) throw new Error(`Birincil anahtarı olmayan tablo: ${table}`);
  return `jsonb_build_array(${cols.map((c) => `${alias}.${q(c)}`).join(", ")})::text`;
}

const joinOn = (fk: ForeignKey, child: string, parent: string) =>
  fk.childCols.map((c, i) => `${child}.${q(c)} = ${parent}.${q(fk.parentCols[i]!)}`).join(" and ");

function add(marks: Marks, table: string, keys: Iterable<string>): string[] {
  const set = marks.get(table) ?? new Set<string>();
  marks.set(table, set);
  const added: string[] = [];
  for (const k of keys) {
    if (!set.has(k)) {
      set.add(k);
      added.push(k);
    }
  }
  return added;
}

function push(target: Marks, table: string, keys: string[]) {
  if (!keys.length) return;
  const set = target.get(table) ?? new Set<string>();
  target.set(table, set);
  for (const k of keys) set.add(k);
}

/** Tek sütunlu "id" anahtarlı tabloların işaretli kimlikleri. */
function idsOf(schema: Schema, marks: Marks): string[] {
  const out: string[] = [];
  for (const [t, keys] of marks) {
    if ((schema.pks.get(t) ?? []).join() !== "id") continue;
    for (const k of keys) {
      const v = JSON.parse(k)[0];
      if (typeof v === "string" && UUID.test(v)) out.push(v);
    }
  }
  return out;
}

/** Kökten aşağı: kökü ve ona (dolaylı) bağlı bütün satırlar (`follow` verilirse yalnızca o bağlarla). */
async function closure(tx: Sql, schema: Schema, seed: Marks, follow: (fk: ForeignKey) => boolean = () => true): Promise<Marks> {
  const { pks } = schema;
  const fks = schema.fks.filter(follow);
  const marks: Marks = new Map();
  let frontier: Marks = new Map();
  for (const [t, keys] of seed) push(frontier, t, add(marks, t, keys));
  while (frontier.size > 0) {
    const next: Marks = new Map();
    for (const [parent, keys] of frontier) {
      const list = [...keys];
      for (const fk of fks.filter((f) => f.parent === parent)) {
        const rows = await tx.unsafe<{ k: string }[]>(
          `select distinct ${keyExpr(pks, fk.child, "c")} as k from ${q(fk.child)} c join ${q(parent)} p on ${joinOn(fk, "c", "p")}
           where ${keyExpr(pks, parent, "p")} = any($1::text[])`,
          [list],
        );
        push(next, fk.child, add(marks, fk.child, rows.map((r) => r.k)));
      }
    }
    // Yabancı anahtarı olmayan bağlar: onay kaydı, üst yönetici kaydı, imzanın konusu
    const newIds = idsOf(schema, frontier);
    if (newIds.length) {
      for (const p of POLYMORPHIC) {
        const rows = await tx.unsafe<{ k: string }[]>(
          `select ${keyExpr(pks, p.table, "t")} as k from ${q(p.table)} t where t.${q(p.column)} = any($1::uuid[])`,
          [newIds],
        );
        push(next, p.table, add(marks, p.table, rows.map((r) => r.k)));
      }
    }
    frontier = next;
  }
  return marks;
}

async function parentsOf(tx: Sql, schema: Schema, fk: ForeignKey, table: string, key: string): Promise<string[]> {
  const rows = await tx.unsafe<{ k: string }[]>(
    `select ${keyExpr(schema.pks, fk.parent, "p")} as k from ${q(table)} t join ${q(fk.parent)} p on ${joinOn(fk, "t", "p")}
     where ${keyExpr(schema.pks, table, "t")} = $1`,
    [key],
  );
  return rows.map((r) => r.k);
}

/**
 * Korunan bir kaydın parçaları: kaydın kendisi ve ayakta kalması için gereken alt satırlar (sürümler, çeviriler,
 * ekler, onay kayıtları). Kişide yalnızca kişiye ait satırlar (user_id…) parçadır; oluşturduğu/onayladığı kayıtlar değil.
 */
function partsOf(tx: Sql, schema: Schema, table: string, id: string): Promise<Marks> {
  const follow = (fk: ForeignKey) => {
    if (PROTECTED_TABLES.has(fk.child) || ITEM_EDGES.has(`${fk.child}.${fk.childCols.join(",")}`)) return false;
    if (fk.parent === "users") return fk.childCols.length === 1 && SUBJECT_USER_COLUMNS.has(fk.childCols[0]!);
    if (fk.parent === "visitors") return fk.childCols.length === 1 && SUBJECT_VISITOR_COLUMNS.has(fk.childCols[0]!);
    return true;
  };
  return closure(tx, schema, new Map([[table, new Set([JSON.stringify([id])])]]), follow);
}

type Ownership = { kind: "real" | "sample" | "none"; reason?: string };

/**
 * Satır kime ait? Kişi sütunu (user_id, visitor_id…) ya da bağlı olduğu üst kayıt üzerinden gerçek bir kişiye
 * ulaşılırsa "real", yalnızca örnek kişilere ulaşılırsa "sample", hiçbir kişiye ulaşılmazsa (içerik, modül,
 * bağlantı satırı) "none". Oluşturan/onaylayan sütunları sahiplik sayılmaz.
 */
function ownershipChecker(tx: Sql, schema: Schema, sampleUsers: Set<string>, sampleVisitors: Set<string>) {
  const memo = new Map<string, Ownership>();
  const pending = new Set<string>();

  async function owner(table: string, key: string): Promise<Ownership> {
    const id = `${table}|${key}`;
    const cached = memo.get(id);
    if (cached) return cached;
    if (pending.has(id)) return { kind: "none" };
    pending.add(id);
    let result: Ownership = { kind: "none" };
    if (table === "users" || table === "visitors") {
      const sample = (table === "users" ? sampleUsers : sampleVisitors).has(JSON.parse(key)[0]);
      result = sample ? { kind: "sample" } : { kind: "real", reason: `gerçek ${table === "users" ? "kişi" : "ziyaretçi"}` };
    } else {
      for (const fk of schema.fks.filter((f) => f.child === table)) {
        if (PROTECTED_TABLES.has(fk.parent)) continue;
        if (fk.parent === "users" || fk.parent === "visitors") {
          const subject = fk.parent === "users" ? SUBJECT_USER_COLUMNS : SUBJECT_VISITOR_COLUMNS;
          if (fk.childCols.length !== 1 || !subject.has(fk.childCols[0]!)) continue;
        }
        for (const parentKey of await parentsOf(tx, schema, fk, table, key)) {
          const o = await owner(fk.parent, parentKey);
          if (o.kind === "real") result = { kind: "real", reason: `${table}.${fk.childCols.join(",")} → ${o.reason}` };
          else if (o.kind === "sample" && result.kind === "none") result = o;
          if (result.kind === "real") break;
        }
        if (result.kind === "real") break;
      }
    }
    pending.delete(id);
    memo.set(id, result);
    return result;
  }

  /**
   * Kişiye ait olmayan bağlantı satırının silinmeyecek bir üst kaydı var mı (ör. gerçek modüle eklenmiş örnek içerik,
   * gerçek içeriğe takılmış örnek etiket)? Kök kayıtlara uygulanmaz: onları yükleyici oluşturdu, gerçek kayıtlara
   * başvurmaları bilinçlidir (ör. ortak modül için örnek sınıf eğitimi).
   */
  async function survivingParent(table: string, key: string, doomed: Marks): Promise<string | null> {
    for (const fk of schema.fks.filter((f) => f.child === table)) {
      if (PROTECTED_TABLES.has(fk.parent) || VOCABULARY_TABLES.has(fk.parent) || fk.parent === "users" || fk.parent === "visitors") continue;
      const alive = (await parentsOf(tx, schema, fk, table, key)).find((p) => !doomed.get(fk.parent)?.has(p));
      if (alive) return `${table}.${fk.childCols.join(",")} → silinmeyen ${fk.parent} kaydı`;
    }
    return null;
  }
  return { owner, survivingParent };
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

type Plan = {
  report: PurgeReport;
  marks: Marks;
  schema: Schema;
  settingRows: { id: string; key: string; item: unknown }[];
  doneRecordIds: string[];
};

async function plan(tx: Sql, log: (line: string) => void): Promise<Plan> {
  const schema = await loadSchema(tx);
  const { pks } = schema;
  const rootRows = await tx.unsafe<{ id: string; table_name: string; record_id: string | null; setting_key: string | null; setting_item: unknown }[]>(
    `select id::text, table_name, record_id::text, setting_key, setting_item from sample_records order by created_at, id`,
  );
  const roots = rootRows.filter((r) => r.record_id).map((r) => ({ id: r.id, table: r.table_name, recordId: r.record_id! }));
  const settingRows = rootRows.filter((r) => r.setting_key).map((r) => ({ id: r.id, key: r.setting_key!, item: r.setting_item }));
  for (const r of roots) {
    if (PROTECTED_TABLES.has(r.table)) throw new Error(`Korunan tablo örnek kök olamaz: ${r.table}`);
    if ((pks.get(r.table) ?? []).join() !== "id") throw new Error(`Kök tablosunun anahtarı "id" olmalı: ${r.table}`);
  }
  const sampleUsers = new Set(roots.filter((r) => r.table === "users").map((r) => r.recordId));
  const sampleVisitors = new Set(roots.filter((r) => r.table === "visitors").map((r) => r.recordId));
  log(`Kök kayıt: ${roots.length}, parametre öğesi: ${settingRows.length}`);

  // Her kökün alt kayıtları (kayıt artık yoksa kök yalnızca listeden düşer)
  const closures = new Map<string, Marks>();
  const missing: string[] = [];
  for (const r of roots) {
    const exists = await tx.unsafe(`select 1 from ${q(r.table)} where id = $1::uuid`, [r.recordId]);
    if (exists.length === 0) {
      missing.push(r.id);
      continue;
    }
    closures.set(r.id, await closure(tx, schema, new Map([[r.table, new Set([JSON.stringify([r.recordId])])]])));
  }
  const all: Marks = new Map();
  for (const c of closures.values()) for (const [t, keys] of c) add(all, t, keys);
  const rootKeys = new Set(roots.map((r) => `${r.table}|${JSON.stringify([r.recordId])}`));

  // Gerçek bir kişiye ait satıra ya da silinmeyecek bir kayda bağlanan kök korunur
  const check = ownershipChecker(tx, schema, sampleUsers, sampleVisitors);
  const verdict = new Map<string, string | null>();
  const foreignRow = async (table: string, key: string): Promise<string | null> => {
    const id = `${table}|${key}`;
    if (verdict.has(id)) return verdict.get(id)!;
    let v: string | null = null;
    if (PROTECTED_TABLES.has(table)) v = `${table} (kurum yapısı)`;
    else {
      const o = await check.owner(table, key);
      if (o.kind === "real") v = `${table}: ${o.reason}`;
      else if (o.kind === "none" && !rootKeys.has(id)) v = await check.survivingParent(table, key, all);
    }
    verdict.set(id, v);
    return v;
  };
  const kept = new Map<string, { table: string; id: string; reason: string }>();
  for (const r of roots) {
    const c = closures.get(r.id);
    if (!c) continue;
    outer: for (const [table, keys] of c) {
      for (const key of keys) {
        const reason = await foreignRow(table, key);
        if (reason) {
          kept.set(r.id, { table: r.table, id: r.recordId, reason });
          break outer;
        }
      }
    }
  }
  // Silinmesi korunan bir kökün parçasını da silecek kök korunur (ör. korunan içeriğin eki olan görsel,
  // onay kaydının onaylayan kişisi). Korunan kökün yalnızca kullandığı ya da ona başvuran satırlar bunu gerektirmez.
  const parts = new Map<string, Marks>();
  for (const kid of kept.keys()) {
    const r = roots.find((x) => x.id === kid)!;
    parts.set(kid, await partsOf(tx, schema, r.table, r.recordId));
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of roots) {
      const c = closures.get(r.id);
      if (!c || kept.has(r.id)) continue;
      for (const [kid, k] of kept) {
        const need = parts.get(kid)!;
        const hit = [...c].find(([t, keys]) => [...keys].some((key) => need.get(t)?.has(key)));
        if (hit) {
          kept.set(r.id, { table: r.table, id: r.recordId, reason: `korunan ${k.table} kaydının parçası (${hit[0]}) buna bağlı` });
          parts.set(r.id, await partsOf(tx, schema, r.table, r.recordId));
          changed = true;
          break;
        }
      }
    }
  }

  const marks: Marks = new Map();
  for (const [rid, c] of closures) if (!kept.has(rid)) for (const [t, keys] of c) add(marks, t, keys);
  await sweepMedia(tx, schema, marks);
  for (const t of marks.keys()) if (PROTECTED_TABLES.has(t) && (marks.get(t)?.size ?? 0) > 0) throw new Error(`Korunan tabloya ulaşıldı: ${t}`);

  // Depodan silinecek dosyalar
  const mediaKeys = [...(marks.get("media_assets") ?? [])];
  const mediaPrefixes = mediaKeys.map((k) => `media/${JSON.parse(k)[0]}/`);
  const storageKeys: string[] = [];
  // İmza görselleri (signatures/…) ve sertifika PDF'leri (documents/…) media/<id>/ dışında durur
  if (mediaKeys.length) {
    const rows = await tx.unsafe<{ id: string; object_key: string; derived: Record<string, unknown> | null }[]>(
      `select id::text, object_key, derived from media_assets t where ${keyExpr(pks, "media_assets", "t")} = any($1::text[])`,
      [mediaKeys],
    );
    for (const r of rows) {
      const keys = [r.object_key, r.derived?.webpKey, r.derived?.thumbKey, r.derived?.posterKey];
      for (const k of keys) if (typeof k === "string" && k && k !== "pending" && !k.startsWith(`media/${r.id}/`)) storageKeys.push(k);
    }
  }
  const sigKeys = [...(marks.get("visitor_signatures") ?? [])];
  if (sigKeys.length) {
    const rows = await tx.unsafe<{ v: string }[]>(
      `select image_key as v from visitor_signatures t where ${keyExpr(pks, "visitor_signatures", "t")} = any($1::text[]) and image_key is not null`,
      [sigKeys],
    );
    storageKeys.push(...rows.map((r) => r.v));
  }

  const deleted: Record<string, number> = {};
  for (const [t, keys] of [...marks].sort(([a], [b]) => a.localeCompare(b))) if (keys.size) deleted[t] = keys.size;
  const report: PurgeReport = {
    dryRun: false,
    roots: roots.length,
    deleted,
    kept: [...kept.values()],
    settingsReverted: settingRows.map((s) => ({ key: s.key, item: s.item })),
    storageKeys,
    mediaPrefixes,
  };
  const doneRecordIds = [...roots.filter((r) => closures.has(r.id) && !kept.has(r.id)).map((r) => r.id), ...missing];
  return { report, marks, schema, settingRows, doneRecordIds };
}

/** Yalnızca silinen satırların kullandığı medya kayıtları da silinir (sertifika PDF'i, imza görseli, fotoğraflar). */
async function sweepMedia(tx: Sql, schema: Schema, marks: Marks) {
  const { pks } = schema;
  const refs = schema.fks.filter((f) => f.parent === "media_assets" && f.childCols.length === 1);
  const candidates = new Set<string>([...(marks.get("media_assets") ?? [])].map((k) => JSON.parse(k)[0] as string));
  for (const fk of refs) {
    const keys = [...(marks.get(fk.child) ?? [])];
    if (!keys.length) continue;
    const col = q(fk.childCols[0]!);
    const rows = await tx.unsafe<{ v: string }[]>(
      `select distinct t.${col}::text as v from ${q(fk.child)} t where ${keyExpr(pks, fk.child, "t")} = any($1::text[]) and t.${col} is not null`,
      [keys],
    );
    for (const r of rows) candidates.add(r.v);
  }
  for (const [table, col] of MEDIA_ARRAYS) {
    const keys = [...(marks.get(table) ?? [])];
    if (!keys.length) continue;
    const rows = await tx.unsafe<{ v: string }[]>(
      `select distinct x.v::text as v from ${q(table)} t, unnest(t.${q(col)}) as x(v) where ${keyExpr(pks, table, "t")} = any($1::text[])`,
      [keys],
    );
    for (const r of rows) candidates.add(r.v);
  }
  if (candidates.size === 0) return;
  const ids = [...candidates];
  const stillUsed = new Set<string>();
  for (const fk of refs) {
    const col = q(fk.childCols[0]!);
    const rows = await tx.unsafe<{ v: string }[]>(
      `select distinct t.${col}::text as v from ${q(fk.child)} t where t.${col} = any($1::uuid[]) and not (${keyExpr(pks, fk.child, "t")} = any($2::text[]))`,
      [ids, [...(marks.get(fk.child) ?? [])]],
    );
    for (const r of rows) stillUsed.add(r.v);
  }
  for (const [table, col] of MEDIA_ARRAYS) {
    const rows = await tx.unsafe<{ v: string }[]>(
      `select distinct x.v::text as v from ${q(table)} t, unnest(t.${q(col)}) as x(v) where x.v = any($1::uuid[]) and not (${keyExpr(pks, table, "t")} = any($2::text[]))`,
      [ids, [...(marks.get(table) ?? [])]],
    );
    for (const r of rows) stillUsed.add(r.v);
  }
  const set = marks.get("media_assets") ?? new Set<string>();
  marks.set("media_assets", set);
  for (const id of ids) {
    // Sonradan gerçek bir kayıtta kullanılan medya silinmez
    if (stillUsed.has(id)) set.delete(JSON.stringify([id]));
    else set.add(JSON.stringify([id]));
  }
}

// ---------------------------------------------------------------------------
// Silme
// ---------------------------------------------------------------------------

async function execute(tx: Sql, p: Plan, log: (line: string) => void) {
  const { pks } = p.schema;
  const remaining = new Set([...p.marks.keys()].filter((t) => (p.marks.get(t)?.size ?? 0) > 0));
  let edges = p.schema.fks.filter((f) => f.child !== f.parent && remaining.has(f.child) && remaining.has(f.parent));
  const keysOf = (t: string) => [...(p.marks.get(t) ?? [])];

  while (remaining.size > 0) {
    // Başka bir kalan tablonun başvurmadığı tablo silinebilir (alt kayıtlar önce)
    const ready = [...remaining].filter((t) => !edges.some((e) => e.parent === t && remaining.has(e.child)));
    if (ready.length === 0) {
      // Döngü (ör. contents ↔ content_versions): döngüdeki boş bırakılabilen bağ önce boşaltılır
      const reaches = (from: string, to: string) => {
        const seen = new Set<string>();
        const stack = [from];
        while (stack.length) {
          const t = stack.pop()!;
          if (t === to) return true;
          if (seen.has(t)) continue;
          seen.add(t);
          for (const e of edges) if (e.child === t && remaining.has(e.parent)) stack.push(e.parent);
        }
        return false;
      };
      const cycle = edges.find((e) => e.nullable && remaining.has(e.child) && remaining.has(e.parent) && reaches(e.parent, e.child));
      if (!cycle) throw new Error(`Silme sırası bulunamadı: ${[...remaining].join(", ")}`);
      await tx.unsafe(
        `update ${q(cycle.child)} t set ${cycle.childCols.map((c) => `${q(c)} = null`).join(", ")} where ${keyExpr(pks, cycle.child, "t")} = any($1::text[])`,
        [keysOf(cycle.child)],
      );
      edges = edges.filter((e) => e !== cycle);
      continue;
    }
    for (const t of ready) {
      const res = await tx.unsafe(`delete from ${q(t)} t where ${keyExpr(pks, t, "t")} = any($1::text[])`, [keysOf(t)]);
      log(`  ${t}: ${res.count}`);
      remaining.delete(t);
    }
  }

  // Parametre listelerine eklenen öğeler çıkarılır (başka öğelere dokunulmaz)
  for (const s of p.settingRows) {
    const [row] = await tx.unsafe<{ value: unknown }[]>(`select value from settings where key = $1`, [s.key]);
    if (!row || !Array.isArray(row.value)) continue;
    const target = JSON.stringify(s.item);
    const next = row.value.filter((v) => JSON.stringify(v) !== target);
    if (next.length !== row.value.length) {
      // Metin olarak gönderilip veritabanında çözülür (doğrudan jsonb parametresi diziyi metin olarak saklardı)
      await tx.unsafe(`update settings set value = $2::text::jsonb, change_note = $3, updated_at = now() where key = $1`, [
        s.key,
        JSON.stringify(next),
        "Örnek veri temizlendi",
      ]);
    }
  }
  const done = [...p.doneRecordIds, ...p.settingRows.map((s) => s.id)];
  if (done.length) await tx.unsafe(`delete from sample_records where id = any($1::uuid[])`, [done]);
}

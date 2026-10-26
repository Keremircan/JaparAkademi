import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { approvals, contentVersions } from "@/server/db/schema";
import { isImmutableViolation } from "@/server/errors";
import {
  approvalQueue,
  approveVersion,
  archiveContent,
  createContent,
  createTag,
  discardDraft,
  getContent,
  getEditableVersion,
  getVersion,
  listContents,
  listTags,
  rejectVersion,
  saveDraft,
  startNewVersion,
  submitForApproval,
} from "@/server/services/content";
import { owner } from "../support/db";
import { seedContentPeople, textBody } from "../support/content";

async function textContent(actor: Parameters<typeof createContent>[0], ownerOrgUnitId: string | null, title: string, text: string, isOhs = false) {
  const { id } = await createContent(actor, { type: "text", title, ownerOrgUnitId, commonTarget: null, isOhs });
  await saveDraft(actor, id, { title, body: textBody(text), tagIds: [] });
  return id;
}

describe("FG-2.3 içerik yayın akışı", () => {
  it("eğitmenin taslağı bölüm sorumlusu onayıyla yayınlanır", async () => {
    const p = await seedContentPeople();
    const id = await textContent(p.trainerPres.actor, p.org.units.pres, "Pres güvenliği", "İki el kumanda kullanılır.");
    expect((await submitForApproval(p.trainerPres.actor, id, { changeNote: null, requireReread: false })).status).toBe("section_review");

    const queue = await approvalQueue(p.smUretim.actor);
    expect(queue.map((q) => q.contentId)).toEqual([id]);
    expect(await approvalQueue(p.smKalite.actor)).toEqual([]);

    expect((await approveVersion(p.smUretim.actor, queue[0]!.versionId)).status).toBe("published");
    const detail = await getContent(p.trainerPres.actor, id);
    expect(detail.currentPublishedVersionId).toBe(queue[0]!.versionId);
    expect(detail.versions[0]).toMatchObject({ status: "published", isCurrent: true });
  });

  it("bölüm sorumlusunun kendi kapsamındaki içeriği kendi onayıyla (auto_self) yayınlanır", async () => {
    const p = await seedContentPeople();
    const id = await textContent(p.smUretim.actor, p.org.units.montaj, "Montaj", "Tork değerleri");
    expect((await submitForApproval(p.smUretim.actor, id, { changeNote: null, requireReread: false })).status).toBe("published");
    const rows = await db().select().from(approvals);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ step: "section", decision: "auto_self", decidedBy: p.smUretim.userId });
  });

  it("İSG içeriği bölüm onayından sonra İSG uzmanına gider; İSG uzmanının İSG içeriği tek adımda yayınlanır", async () => {
    const p = await seedContentPeople();
    const id = await textContent(p.smUretim.actor, p.org.units.pres, "Pres İSG", "KKD zorunlu", true);
    expect((await submitForApproval(p.smUretim.actor, id, { changeNote: null, requireReread: false })).status).toBe("ohs_review");
    const [q] = await approvalQueue(p.ohs.actor);
    expect(q).toMatchObject({ contentId: id, step: "ohs" });
    expect(await approvalQueue(p.smUretim.actor)).toEqual([]);
    expect((await approveVersion(p.ohs.actor, q!.versionId)).status).toBe("published");

    const common = await textContent(p.ohs.actor, null, "Genel İSG", "Acil durum toplanma alanı", true);
    expect((await submitForApproval(p.ohs.actor, common, { changeNote: null, requireReread: false })).status).toBe("published");
  });

  it("ret gerekçe ister; reddedilen sürüm düzenlenip yeniden gönderilir", async () => {
    const p = await seedContentPeople();
    const id = await textContent(p.trainerPres.actor, p.org.units.pres, "Kalıp değişimi", "Adımlar");
    await submitForApproval(p.trainerPres.actor, id, { changeNote: null, requireReread: false });
    const [q] = await approvalQueue(p.smUretim.actor);
    await expect(rejectVersion(p.smUretim.actor, q!.versionId, " ")).rejects.toMatchObject({ code: "reject_comment_required" });
    await rejectVersion(p.smUretim.actor, q!.versionId, "Fotoğraf ekleyin");
    expect((await getContent(p.trainerPres.actor, id)).versions[0]!.status).toBe("rejected");

    await saveDraft(p.trainerPres.actor, id, { title: "Kalıp değişimi", body: textBody("Adımlar ve fotoğraf"), tagIds: [] });
    expect((await getContent(p.trainerPres.actor, id)).versions[0]!.status).toBe("draft");
    expect((await submitForApproval(p.trainerPres.actor, id, { changeNote: null, requireReread: false })).status).toBe("section_review");
  });

  it("kimse kendi gönderdiği sürümü onaylayamaz", async () => {
    const p = await seedContentPeople();
    // İK ortak İSG içeriği gönderir (bölüm adımı kendi onayı) → İSG adımında bekler
    const own = await textContent(p.hr.actor, null, "Şirket tanıtımı", "JAPAR", true);
    await submitForApproval(p.hr.actor, own, { changeNote: null, requireReread: false });
    const versionId = (await getContent(p.hr.actor, own)).versions[0]!.id;
    await owner()`insert into user_roles (user_id, role) values (${p.hr.userId}, 'ohs_specialist')`;
    const both = { ...p.hr.actor, roles: [...p.hr.actor.roles, "ohs_specialist" as const] };
    expect(await approvalQueue(both)).not.toContainEqual(expect.objectContaining({ versionId }));
    await expect(approveVersion(both, versionId)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("onaya göndermek için gövde tam olmalı; yeni sürümde değişiklik notu zorunlu", async () => {
    const p = await seedContentPeople();
    const { id } = await createContent(p.smUretim.actor, { type: "checklist", title: "Vardiya kontrol", ownerOrgUnitId: p.org.units.pres, commonTarget: null, isOhs: false });
    await expect(submitForApproval(p.smUretim.actor, id, { changeNote: null, requireReread: false })).rejects.toMatchObject({ code: "body_incomplete" });
    await saveDraft(p.smUretim.actor, id, { title: "Vardiya kontrol", body: { items: [{ text: "Yağ seviyesi", critical: true }] }, tagIds: [] });
    await submitForApproval(p.smUretim.actor, id, { changeNote: null, requireReread: false });

    await startNewVersion(p.smUretim.actor, id);
    await expect(submitForApproval(p.smUretim.actor, id, { changeNote: "", requireReread: true })).rejects.toMatchObject({ code: "change_note_required" });
    await submitForApproval(p.smUretim.actor, id, { changeNote: "Hava basıncı eklendi", requireReread: true });
    const d = await getContent(p.smUretim.actor, id);
    expect(d.versions.map((v) => [v.version, v.status, v.isCurrent])).toEqual([
      [2, "published", true],
      [1, "published", false],
    ]);
    expect(d.versions[0]).toMatchObject({ changeNote: "Hava basıncı eklendi", requireReread: true });
  });
});

describe("FG-2.2 sürümleme ve değiştirilemezlik", () => {
  it("yayınlanmış sürüm, dil satırı ve medya bağlantısı değiştirilemez", async () => {
    const p = await seedContentPeople();
    const id = await textContent(p.smUretim.actor, p.org.units.pres, "Sürüm", "v1");
    await submitForApproval(p.smUretim.actor, id, { changeNote: null, requireReread: false });
    const [v] = await db().select().from(contentVersions).where(eq(contentVersions.contentId, id));

    const attempts = [
      db().update(contentVersions).set({ changeNote: "x" }).where(eq(contentVersions.id, v!.id)),
      db().delete(contentVersions).where(eq(contentVersions.id, v!.id)),
      owner()`update content_version_locales set title = 'x' where content_version_id = ${v!.id}`,
      owner()`delete from content_version_locales where content_version_id = ${v!.id}`,
    ];
    for (const attempt of attempts) {
      const err = await Promise.resolve(attempt).then(() => null, (e: unknown) => e);
      expect(isImmutableViolation(err)).toBe(true);
    }
    // Yayınlanmış sürüm düzenlenemez; yeni sürüm açılır
    await expect(saveDraft(p.smUretim.actor, id, { title: "Sürüm", body: textBody("v2"), tagIds: [] })).rejects.toMatchObject({ code: "version_not_editable" });
    await startNewVersion(p.smUretim.actor, id);
    await saveDraft(p.smUretim.actor, id, { title: "Sürüm", body: textBody("v2"), tagIds: [] });
    expect((await getVersion(p.smUretim.actor, v!.id)).body).toEqual(textBody("v1"));
  });

  it("onay kayıtları değiştirilemez", async () => {
    const p = await seedContentPeople();
    const id = await textContent(p.smUretim.actor, p.org.units.pres, "Onay", "metin");
    await submitForApproval(p.smUretim.actor, id, { changeNote: null, requireReread: false });
    const err = await db().update(approvals).set({ comment: "x" }).then(() => null, (e: unknown) => e);
    expect(isImmutableViolation(err)).toBe(true);
  });

  it("taslak yeni sürüm silinebilir, ilk sürüm silinemez", async () => {
    const p = await seedContentPeople();
    const id = await textContent(p.smUretim.actor, p.org.units.pres, "İlk", "metin");
    await expect(discardDraft(p.smUretim.actor, id)).rejects.toMatchObject({ code: "cannot_discard" });
    await submitForApproval(p.smUretim.actor, id, { changeNote: null, requireReread: false });
    await startNewVersion(p.smUretim.actor, id);
    await saveDraft(p.smUretim.actor, id, { title: "Değişti", body: textBody("yeni"), tagIds: [] });
    await discardDraft(p.smUretim.actor, id);
    const d = await getContent(p.smUretim.actor, id);
    expect(d.versions).toHaveLength(1);
    expect(d.title).toBe("İlk");
  });
});

describe("FG-2.4 / FG-2.5 kütüphane görünürlüğü, arama ve etiketler", () => {
  it("rol ve kapsama göre görünürlük (karar: İK/İSG hepsi; bölüm sorumlusu kapsam + ortak; eğitmen kendi birimi + ortak)", async () => {
    const p = await seedContentPeople();
    const pres = await textContent(p.smUretim.actor, p.org.units.pres, "Pres", "a");
    const uretim = await textContent(p.smUretim.actor, p.org.units.uretim, "Üretim genel", "b");
    const montaj = await textContent(p.smUretim.actor, p.org.units.montaj, "Montaj", "c");
    const kalite = await textContent(p.smKalite.actor, p.org.units.kalite, "Kalite", "d");
    const common = await textContent(p.hr.actor, null, "Ortak", "e");

    const ids = async (actor: typeof p.hr.actor) => (await listContents(actor, {})).items.map((i) => i.id).sort();
    expect(await ids(p.hr.actor)).toEqual([pres, uretim, montaj, kalite, common].sort());
    expect(await ids(p.ohs.actor)).toEqual([pres, uretim, montaj, kalite, common].sort());
    expect(await ids(p.smUretim.actor)).toEqual([pres, uretim, montaj, common].sort());
    expect(await ids(p.smKalite.actor)).toEqual([kalite, common].sort());
    expect(await ids(p.trainerPres.actor)).toEqual([pres, uretim, common].sort());
    await expect(listContents(p.sysadmin.actor, {})).rejects.toMatchObject({ code: "forbidden" });
    await expect(listContents(p.personnel.actor, {})).rejects.toMatchObject({ code: "forbidden" });
    await expect(getContent(p.trainerPres.actor, kalite)).rejects.toMatchObject({ code: "not_found" });
  });

  it("taslak yetkisi: eğitmen kendi birimi dışında, İK birime ait içerikte taslak hazırlayamaz", async () => {
    const p = await seedContentPeople();
    const base = { type: "text" as const, title: "Deneme", commonTarget: null, isOhs: false };
    await expect(createContent(p.trainerPres.actor, { ...base, ownerOrgUnitId: p.org.units.kalite })).rejects.toMatchObject({ code: "forbidden" });
    await expect(createContent(p.trainerPres.actor, { ...base, ownerOrgUnitId: null })).rejects.toMatchObject({ code: "forbidden" });
    await expect(createContent(p.hr.actor, { ...base, ownerOrgUnitId: p.org.units.pres })).rejects.toMatchObject({ code: "forbidden" });
    await expect(createContent(p.ohs.actor, { ...base, ownerOrgUnitId: p.org.units.pres })).rejects.toMatchObject({ code: "forbidden" });
    expect(await createContent(p.ohs.actor, { ...base, ownerOrgUnitId: p.org.units.pres, isOhs: true })).toHaveProperty("id");
  });

  it("Türkçe tam metin arama: ek, büyük/küçük harf ve aksan farkına dayanıklı; etiket adıyla bulunur", async () => {
    const p = await seedContentPeople();
    const a = await textContent(p.smUretim.actor, p.org.units.pres, "Pres makinesi güvenliği", "Operatör iki el kumandasını kullanır.");
    const b = await textContent(p.smUretim.actor, p.org.units.montaj, "Montaj hattı", "Cıvata sıkma torku");
    const groups = await listTags(p.smUretim.actor);
    const machine = groups.find((g) => g.key === "machine")!;
    const tag = await createTag(p.smUretim.actor, { tagTypeId: machine.typeId, name: "Hidrolik Pres" });
    await saveDraft(p.smUretim.actor, b, { title: "Montaj hattı", body: textBody("Cıvata sıkma torku"), tagIds: [tag.id] });

    const search = async (q: string) => (await listContents(p.smUretim.actor, { q })).items.map((i) => i.id);
    expect(await search("güvenlik")).toEqual([a]);
    expect(await search("GUVENLIGI")).toEqual([a]);
    expect(await search("makine")).toEqual([a]);
    expect(await search("güvenliğe")).toEqual([a]);
    expect(await search("kumanda")).toEqual([a]);
    expect(await search("civata")).toEqual([b]);
    expect(await search("hidrolik")).toEqual([b]);
    expect((await search("pres")).sort()).toEqual([a, b].sort());
    expect(await search("yok-boyle-bir-sey")).toEqual([]);
    expect((await listContents(p.smUretim.actor, { tagId: tag.id })).items.map((i) => i.id)).toEqual([b]);
  });

  it("aynı adda etiket tekrar oluşturulmaz", async () => {
    const p = await seedContentPeople();
    const risk = (await listTags(p.hr.actor)).find((g) => g.key === "risk")!;
    const t1 = await createTag(p.trainerPres.actor, { tagTypeId: risk.typeId, name: "Sıkışma" });
    const t2 = await createTag(p.hr.actor, { tagTypeId: risk.typeId, name: "  sıkışma " });
    expect(t2.id).toBe(t1.id);
  });

  it("arşivleme: onay yetkisi olan arşivler; arşivlenen içerik listeden çıkar ve düzenlenemez", async () => {
    const p = await seedContentPeople();
    const id = await textContent(p.trainerPres.actor, p.org.units.pres, "Eski talimat", "metin");
    await expect(archiveContent(p.trainerPres.actor, id)).rejects.toMatchObject({ code: "forbidden" });
    await archiveContent(p.smUretim.actor, id);
    expect((await listContents(p.smUretim.actor, {})).items).toHaveLength(0);
    expect((await listContents(p.smUretim.actor, { status: "archived" })).items.map((i) => i.id)).toEqual([id]);
    await expect(getEditableVersion(p.trainerPres.actor, id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(archiveContent(p.smUretim.actor, id)).rejects.toMatchObject({ code: "content_archived" });
  });
});

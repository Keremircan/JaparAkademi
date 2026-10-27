import { createTranslator } from "next-intl";
import QRCode from "qrcode";
import { eq, inArray } from "drizzle-orm";
import { systemActor } from "@/server/authz/actor";
import { db } from "@/server/db/client";
import { certificates, mediaAssets } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { env } from "@/server/env";
import { renderCertificatePdf, type CertificatePdfData } from "@/server/pdf/certificate";
import { documentNo } from "@/server/state/certification";
import { getObjectBuffer, uploadBuffer } from "@/server/storage/client";
import messages from "../../../../messages/tr.json";
import { notify } from "../notifications";
import { getSettings } from "../settings";

/**
 * Sertifika PDF'i (worker işi `certificate.render`). Belge, düzenlendiği andaki kopyadan (snapshot) üretilir ve
 * `documents/certificates/` altında saklanır. PDF bağlantısı bir kez yazılır (trigger).
 */

export class CertificateNotReadyError extends Error {}

export async function renderCertificate(certificateId: string): Promise<void> {
  const [c] = await db().select().from(certificates).where(eq(certificates.id, certificateId)).limit(1);
  // Kayıt henüz görünmüyorsa (düzenleyen transaction sürüyor) iş yeniden denenir
  if (!c) throw new CertificateNotReadyError(certificateId);
  if (c.pdfAssetId) return;

  const t = createTranslator({ locale: "tr", messages, namespace: "certificates.pdf" });
  const appName = createTranslator({ locale: "tr", messages, namespace: "app" })("name");
  const { "org.timezone": timeZone } = await getSettings(["org.timezone"]);
  const date = (d: Date | string | null) => (d ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeZone }).format(new Date(d)) : "—");
  const s = c.snapshot;
  const no = documentNo(c.serialNo, c.issuedAt.getFullYear());
  const verifyUrl = new URL(`/verify/${c.verifyToken}`, env().APP_URL).toString();

  // İmza yetkililerinin taranmış imzaları (PNG/JPG)
  const sigIds = s.signatories.map((x) => x.signatureAssetId).filter((x): x is string => !!x);
  const sigAssets = sigIds.length ? await db().select().from(mediaAssets).where(inArray(mediaAssets.id, sigIds)) : [];
  const images = new Map<string, { data: Buffer; format: "png" | "jpg" } | null>();
  for (const a of sigAssets) {
    const format = a.mime === "image/png" ? "png" : a.mime === "image/jpeg" ? "jpg" : null;
    const data = format ? await getObjectBuffer(a.objectKey) : null;
    images.set(a.id, format && data ? { data, format } : null);
  }

  const isPosition = c.kind === "position_competency";
  const details = [
    ...(s.sicilNo ? [{ label: t("sicil"), value: s.sicilNo }] : []),
    ...(s.positionName ? [{ label: t("position"), value: s.positionName }] : []),
    ...(s.unitName ? [{ label: t("unit"), value: s.unitName }] : []),
    { label: t("issuedAt"), value: date(c.issuedAt) },
    { label: t("expiresAt"), value: c.expiresAt ? date(c.expiresAt) : t("unlimited") },
    ...(s.approverName ? [{ label: isPosition ? t("approver") : t("issuer"), value: s.approverName }] : []),
  ];
  const data: CertificatePdfData = {
    appName,
    heading: t(`heading.${c.kind}`),
    intro: isPosition ? t("intro.position_competency", { scope: s.scope }) : t("intro.attendance", { scope: s.scope }),
    fullName: s.fullName,
    details,
    table: s.modules.length
      ? {
          headers: [t("table.module"), t("table.duration"), t("table.date"), t("table.method"), t("table.trainer")],
          rows: s.modules.map((m) => [
            m.isOhs ? `${m.title} (${t("ohs")})` : m.title,
            t("minutes", { n: m.durationMin }),
            date(m.completedAt),
            m.via ? t(`methods.${m.via as "online"}`) : "—",
            m.trainerName ?? "—",
          ]),
        }
      : null,
    summary: [
      ...(s.theoryScore !== null ? [t("theoryScore", { score: s.theoryScore })] : []),
      ...(s.practicalScore !== null ? [t("practicalScore", { score: s.practicalScore })] : []),
    ],
    signatories: s.signatories.map((x) => ({ name: x.name, title: x.title, image: x.signatureAssetId ? (images.get(x.signatureAssetId) ?? null) : null })),
    footer: { documentNo: no, verifyLabel: t("verifyLabel"), verifyUrl, qrDataUrl: await QRCode.toDataURL(verifyUrl, { margin: 0, width: 240 }) },
  };

  const pdf = await renderCertificatePdf(data);
  const key = `documents/certificates/${c.id}.pdf`;
  await uploadBuffer(key, pdf, "application/pdf");
  await withActor(systemActor("worker:certificate.render"), async (tx) => {
    const [fresh] = await tx.select({ pdfAssetId: certificates.pdfAssetId }).from(certificates).where(eq(certificates.id, c.id)).limit(1).for("update");
    if (fresh?.pdfAssetId) return;
    const [asset] = await tx
      .insert(mediaAssets)
      .values({ kind: "pdf", status: "ready", objectKey: key, mime: "application/pdf", size: pdf.length, originalName: `${no}.pdf`, pageCount: 1, createdBy: c.issuedBy ?? c.userId })
      .returning({ id: mediaAssets.id });
    await tx.update(certificates).set({ pdfAssetId: asset!.id }).where(eq(certificates.id, c.id));
    await notify(tx, { kind: "certificate_ready", userIds: [c.userId], subjectKey: `certificate:${c.id}`, link: "/learn", params: { title: c.title } });
  });
}

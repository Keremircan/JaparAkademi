import { BadgeCheck, CircleAlert, CircleX, Clock } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { getRequestMeta } from "@/server/auth/request";
import { verifyFromRequest } from "@/server/services/certificates";
import { AuthCard } from "../../auth-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("certificates.verify");
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** Herkese açık sertifika doğrulama (FG-7.2): maskeli ad, kapsam, tarihler, durum. Giriş gerekmez. */
export default function Page({ params }: PageProps<"/[locale]/verify/[token]">) {
  return (
    <Suspense fallback={null}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [t, format, meta] = await Promise.all([getTranslations("certificates.verify"), getFormatter(), getRequestMeta()]);
  const result = await verifyFromRequest(token, meta.ip);
  const date = (d: Date) => format.dateTime(d, { dateStyle: "long" });

  if (result === "rate_limited") {
    return (
      <AuthCard title={t("title")}>
        <p role="alert">{t("rateLimited")}</p>
      </AuthCard>
    );
  }
  if (!result) {
    return (
      <AuthCard title={t("title")}>
        <p role="alert" className="flex items-center gap-2 text-lg">
          <CircleAlert aria-hidden="true" className="size-6 text-destructive" />
          {t("notFound")}
        </p>
      </AuthCard>
    );
  }
  const Icon = result.state === "valid" ? BadgeCheck : result.state === "expired" ? Clock : CircleX;
  const tone = result.state === "valid" ? "border-emerald-600 text-emerald-700 dark:text-emerald-400" : "border-destructive text-destructive";
  return (
    <AuthCard title={t("title")}>
      <div className="flex flex-col gap-5">
        <p className={`flex items-center gap-3 rounded-xl border-2 p-4 text-xl font-semibold ${tone}`} role="status">
          <Icon aria-hidden="true" className="size-8 shrink-0" />
          {t(`state.${result.state}`)}
        </p>
        <dl className="grid gap-3">
          <Row label={t("name")} value={result.maskedName} />
          <Row label={t("kind")} value={t(`kinds.${result.kind}`)} />
          <Row label={t("scope")} value={result.scope} />
          <Row label={t("documentNo")} value={result.documentNo} />
          <Row label={t("issuedAt")} value={date(result.issuedAt)} />
          <Row label={t("expiresAt")} value={result.expiresAt ? date(result.expiresAt) : t("unlimited")} />
        </dl>
        <p className="text-sm text-muted-foreground">{t("privacy")}</p>
      </div>
    </AuthCard>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-lg">{value}</dd>
    </div>
  );
}

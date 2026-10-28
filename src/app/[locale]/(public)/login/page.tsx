import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/features/auth/components/login-form";
import { ClearEvacuationCache } from "@/features/visitors/components/offline-evacuation";
import { AuthCard } from "../auth-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  return { title: t("title") };
}

export default async function LoginPage() {
  const t = await getTranslations("auth.login");

  return (
    <AuthCard title={t("title")}>
      <LoginForm />
      {/* Çıkış yapılmış cihazda tahliye listesi kalmaz (karar #160) */}
      <ClearEvacuationCache />
    </AuthCard>
  );
}

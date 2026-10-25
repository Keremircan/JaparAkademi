import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { requireUser } from "@/server/auth/current-user";
import { getSetting } from "@/server/services/settings";
import { AuthCard } from "../auth-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.changePassword");
  return { title: t("title") };
}

export default async function ChangePasswordPage() {
  const t = await getTranslations();

  return (
    <AuthCard title={t("auth.changePassword.title")}>
      <Suspense fallback={<p className="text-muted-foreground">{t("common.loading")}</p>}>
        <ChangePasswordSection />
      </Suspense>
    </AuthCard>
  );
}

async function ChangePasswordSection() {
  const user = await requireUser({ allowPasswordChange: true });
  const [t, minLength] = await Promise.all([getTranslations("auth.changePassword"), getSetting("auth.password_min_length")]);
  return (
    <>
      {user.mustChangePassword && <p className="mb-5 rounded-lg bg-muted px-4 py-3">{t("firstLoginInfo")}</p>}
      <ChangePasswordForm minLength={minLength} />
    </>
  );
}

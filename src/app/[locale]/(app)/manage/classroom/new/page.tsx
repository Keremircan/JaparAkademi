import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { ClassroomForm } from "@/features/classroom/components/classroom-form";
import { libraryAccess } from "@/features/content/guard";
import { can } from "@/server/authz/policy";
import { today } from "@/server/services/assignments/engine";
import { classroomModules } from "@/server/services/classroom";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("classroom");
  return { title: t("new") };
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const access = await libraryAccess();
  if (!access || !can(access.actor, "classroom.record")) return <NotFoundView />;
  const [t, modules, todayStr] = await Promise.all([getTranslations("classroom"), classroomModules(access.actor), today()]);
  return (
    <section>
      <PageHeader title={t("new")} description={t("newIntro")} back={{ href: "/manage/classroom", label: t("title") }} />
      <ClassroomForm
        id={null}
        modules={modules}
        form={null}
        initial={{
          moduleId: "",
          trainer: { userId: access.user.userId, name: access.user.fullName, sicilNo: access.user.sicilNo },
          sessionDate: todayStr,
          durationMin: 60,
          location: "",
          notes: "",
          attendees: [],
        }}
      />
    </section>
  );
}

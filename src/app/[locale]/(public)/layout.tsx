import type { ReactNode } from "react";
import { DeviceTheme } from "@/components/theme/theme-sync";

/** Girişten önceki ve giriş akışındaki ekranlar: koyu/açık mod her zaman cihazın ayarına uyar (karar #273). */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DeviceTheme />
      {children}
    </>
  );
}

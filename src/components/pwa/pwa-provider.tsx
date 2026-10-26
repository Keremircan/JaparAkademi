"use client";

import { SerwistProvider } from "@serwist/turbopack/react";
import type { ReactNode } from "react";

/**
 * Service worker kaydı. Geliştirmede kapalı.
 * cacheOnNavigation kapalı: ziyaret edilen sayfalar (kişisel veri) önbelleğe gönderilmez.
 */
export function PwaProvider({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/serwist/sw.js"
      disable={process.env.NODE_ENV === "development"}
      cacheOnNavigation={false}
      reloadOnOnline
    >
      {children}
    </SerwistProvider>
  );
}

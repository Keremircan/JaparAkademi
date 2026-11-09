"use client";

import { useRouter } from "next/navigation";
import { Fragment, type ReactNode } from "react";

/**
 * Yeni kayıt sayfalarındaki formu her bağlantıyla açılışta baştan kurar (karar #292).
 *
 * `cacheComponents` açıkken Next son sayfaları gizli tutup yeniden kullanır (`<Activity>`). Yeni kayıt
 * sayfasına bağlantıyla dönülünce önceki kaydın yazıları kalıyor, adresten gelen ön seçim (ör.
 * `?orgUnitId=`) değişse de form ilk açılıştaki seçimi gösteriyordu. `bfcacheId` bağlantı ve
 * yönlendirmeyle her gelişte değişir; tarayıcının geri/ileri tuşunda aynı kalır (yazılanlar korunur).
 */
export function FreshOnNavigate({ children }: { children: ReactNode }) {
  const { bfcacheId } = useRouter();
  return <Fragment key={bfcacheId}>{children}</Fragment>;
}

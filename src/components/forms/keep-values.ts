"use client";

import { startTransition, type FormEvent } from "react";

/**
 * Formu, yazılanları silmeden gönderir (karar #271).
 *
 * React 19'da `<form action={…}>` her gönderimden sonra alanları başa döndürür; sunucu hata
 * döndürdüğünde kişinin yazdıkları (ve seçtiği dosya) kaybolurdu. Burada gönderim `onSubmit`
 * içinde elle yapılır, sıfırlama olmaz. `action` yine verilir: sayfa yüklenmeden basılırsa
 * form tarayıcının kendi yöntemiyle (alanlar adres satırında) gönderilmez.
 *
 * Kullanım: `<form {...keepValues(formAction)}>`
 */
export function keepValues(dispatch: (data: FormData) => void) {
  return {
    action: dispatch,
    onSubmit(e: FormEvent<HTMLFormElement>) {
      e.preventDefault();
      const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
      startTransition(() => dispatch(data));
    },
  };
}

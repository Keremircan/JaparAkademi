import { notFound } from "next/navigation";

// Her zaman 404 döner; anında geçiş doğrulamasına gerek yok
export const instant = false;

/** Tanımsız adresler [locale]/not-found.tsx'e düşsün diye (next-intl önerisi). */
export default function CatchAllPage() {
  notFound();
}

import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";

/** Giriş ve şifre sayfalarının ortak çerçevesi (telefon öncelikli, ortalanmış kart). */
export function AuthCard({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo priority className="w-56" />
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {intro && <p className="mt-2 text-muted-foreground">{intro}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}

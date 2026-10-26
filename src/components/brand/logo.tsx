import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * JAPAR Academy logosu. Kaynak dosya beyaz zeminli JPG olduğu için karanlık modda renkleri ters çevrilir.
 * Vektörel/şeffaf logo geldiğinde (SPEC Bölüm 18) bu bileşen güncellenecek.
 */
export function Logo({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/japar-academy-logo.jpg"
      alt="JAPAR Academy"
      width={1600}
      height={1000}
      priority={priority}
      className={cn("h-auto w-48 dark:invert", className)}
    />
  );
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/current-user";
import { NotFoundError } from "@/server/errors";
import { toActor } from "@/server/services/auth";
import { openNotification } from "@/server/services/notifications";

/**
 * Push bildirimine dokununca açılan adres (karar #176): oturum ve sahiplik kontrol edilir, bildirim okundu
 * sayılır, ilgili ekrana gidilir. Kişinin olmayan ya da silinmiş bildiriminde bildirim listesi açılır.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url), { status: 303, headers: { "Cache-Control": "private, no-store" } });
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return to("/login");
  if (user.mustChangePassword) return to("/change-password");
  if (!z.uuid().safeParse(id).success) return to("/notifications");
  try {
    const { link } = await openNotification(toActor(user), id);
    // Yalnızca uygulama içi yol (açık yönlendirme yok)
    return to(link.startsWith("/") && !link.startsWith("//") ? link : "/notifications");
  } catch (err) {
    if (err instanceof NotFoundError) return to("/notifications");
    throw err;
  }
}

import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/** Dil önekini otomatik yöneten Link, redirect ve router yardımcıları. */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);

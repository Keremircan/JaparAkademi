import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Yerel e2e derlemesi ayrı klasöre yazılır (playwright.config.ts): geliştirme sunucusunun `.next` önbelleği bozulmaz.
// Next derlemede tsconfig'e derleme klasörünün tür yollarını ekler; e2e derlemesi bu yüzden kendi tsconfig'ini kullanır.
const distDir = process.env.NEXT_DIST_DIR || ".next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Docker imajında bağımsız sunucu çıktısı (yalnızca imaj derlemesinde; yerel `next start` etkilenmez — karar #100)
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  distDir,
  typescript: { tsconfigPath: distDir === ".next" ? "tsconfig.json" : "tsconfig.e2e.json" },
  poweredByHeader: false,
  // Node'da doğrudan çalışan paketler (PDF ve Excel); sunucu paketine gömülmez
  serverExternalPackages: ["@react-pdf/renderer", "exceljs"],
  experimental: {
    serverActions: {
      // Excel aktarımı en fazla 2 MB (FG-1.4); form alanlarıyla birlikte pay bırakılır
      bodySizeLimit: "3mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withSerwist(withNextIntl(nextConfig));

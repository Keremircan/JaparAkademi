import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Docker imajında bağımsız sunucu çıktısı (yalnızca imaj derlemesinde; yerel `next start` etkilenmez — karar #100)
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
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

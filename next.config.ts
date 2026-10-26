import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Not: Docker image'ı için `output: "standalone"` iş paketi 1.8'de eklenecek (next start ile uyumsuz)
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

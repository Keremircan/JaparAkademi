import { createSerwistRoute } from "@serwist/turbopack";

// Service worker derleme anındaki sürüm; çevrimdışı sayfasının önbelleği her derlemede yenilenir.
const revision = process.env.BUILD_REVISION ?? Date.now().toString(36);

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "src/app/sw.ts",
  // Windows'ta native esbuild kullanılır (esbuild-wasm kurulu değil)
  useNativeEsbuild: true,
  additionalPrecacheEntries: [{ url: "/~offline", revision }],
  // Kişisel veri içerebilecek hiçbir sayfa önbelleğe alınmaz; yalnızca derleme çıktısındaki
  // statik dosyalar ile marka görselleri ve ikonlar (desenler proje köküne göredir)
  globPatterns: [".next/static/**/*.{js,css,woff2}", "public/brand/**/*", "public/icons/**/*"],
});

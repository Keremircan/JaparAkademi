import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_COLORS, THEME_COOKIE, THEME_SCRIPT, themeCookie, toTheme } from "@/lib/theme";

/** Betiği sahte bir `document` ile çalıştırır; sonuçta yazılan nitelik ve çubuk renkleri döner. */
function runScript(cookie: string) {
  const attrs: Record<string, string> = {};
  const metas = [{ content: THEME_COLORS.light }, { content: THEME_COLORS.dark }];
  const document = {
    cookie,
    documentElement: { setAttribute: (name: string, value: string) => (attrs[name] = value) },
    querySelectorAll: () => metas,
  };
  new Function("document", THEME_SCRIPT)(document);
  return { theme: attrs["data-theme"] ?? null, metas: metas.map((m) => m.content) };
}

/** globals.css içindeki bir kural bloğunun gövdesi (iç içe süslü parantez yok). */
function block(css: string, selector: string) {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThan(-1);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

describe("Koyu/açık mod (iş paketi 3.12, kararlar #272–274)", () => {
  it("karar #272 tercih değerleri: bilinmeyen değer Sistem sayılır", () => {
    expect(toTheme("light")).toBe("light");
    expect(toTheme("dark")).toBe("dark");
    expect(toTheme("system")).toBe("system");
    expect(toTheme("blue")).toBe("system");
    expect(toTheme(null)).toBe("system");
  });

  it("karar #274 çerez: Koyu/Açık bir yıl saklanır, Sistem çerezi siler; HTTPS'te Secure", () => {
    expect(themeCookie("dark", true)).toBe(`${THEME_COOKIE}=dark; max-age=31536000; path=/; SameSite=Lax; Secure`);
    expect(themeCookie("light", false)).toBe(`${THEME_COOKIE}=light; max-age=31536000; path=/; SameSite=Lax`);
    expect(themeCookie("system", false)).toBe(`${THEME_COOKIE}=; max-age=0; path=/; SameSite=Lax`);
  });

  it("karar #274 ilk çizim betiği: çerezdeki tercihi <html>e ve tarayıcı çubuğuna yazar, başka değere dokunmaz", () => {
    expect(runScript(`a=1; ${THEME_COOKIE}=dark; b=2`)).toEqual({ theme: "dark", metas: [THEME_COLORS.dark, THEME_COLORS.dark] });
    expect(runScript(`${THEME_COOKIE}=light`)).toEqual({ theme: "light", metas: [THEME_COLORS.light, THEME_COLORS.light] });
    // Çerez yok, geçersiz değer ya da benzer adlı başka çerez: cihazın ayarı kalır
    const untouched = { theme: null, metas: [THEME_COLORS.light, THEME_COLORS.dark] };
    expect(runScript("")).toEqual(untouched);
    expect(runScript(`${THEME_COOKIE}=blue`)).toEqual(untouched);
    expect(runScript(`x${THEME_COOKIE}=dark`)).toEqual(untouched);
    expect(runScript(`${THEME_COOKIE}=darker`)).toEqual(untouched);
  });

  it("karar #273 koyu renkler iki yerde aynıdır: tercih Koyu ile cihaz koyu (tercih Açık değilken)", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    const chosen = block(css, ':root[data-theme="dark"]');
    const device = block(css, ':root:not([data-theme="light"])');
    expect(chosen).toContain("color-scheme: dark;");
    expect(chosen.some((l) => l.startsWith("--background:"))).toBe(true);
    expect(device).toEqual(chosen);
    expect(block(css, ":root")).toContain("color-scheme: light;");
    // Tailwind `dark:` değişkeni de iki koşulu izler
    expect(css).toMatch(/@custom-variant dark \{[\s\S]*\[data-theme="dark"\][\s\S]*prefers-color-scheme: dark[\s\S]*:not\(\[data-theme="light"\]\)/);
  });
});

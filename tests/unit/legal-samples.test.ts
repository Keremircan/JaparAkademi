import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LegalTextBody } from "@/features/legal/components/legal-text-body";
import { placeholderLabel, placeholdersIn } from "@/lib/legal";
import { legalSample, SAMPLE_KINDS } from "@/server/services/legal-samples";

const retention = { personnelYears: 17, loginDays: 400, auditYears: 16, visitorYears: 3, contractorYears: 4, blacklistYears: 5 };

describe("doldurulacak alanlar (iş paketi 3.8, karar #246)", () => {
  it("[[...]] alanlarını ilk görünme sırasıyla ve tekrarsız bulur; başlık ve gövde birlikte taranır", () => {
    expect(placeholdersIn("Unvan: [[Şirket unvanı]], adres: [[Adres]]", "[[Adres]] ve [[KEP adresi]]")).toEqual([
      "Şirket unvanı",
      "Adres",
      "KEP adresi",
    ]);
    expect(placeholdersIn("Doldurulmuş metin", "")).toEqual([]);
  });

  it("tek köşeli parantez ve satır atlayan parantez alan sayılmaz; boş alan da yayını engeller", () => {
    expect(placeholdersIn("[Adres] ve [[\nX]] metin")).toEqual([]);
    expect(placeholdersIn("[[ ]]")).toEqual(["[[ ]]"]);
    expect(placeholderLabel("Adres")).toBe("[[Adres]]");
    expect(placeholderLabel("[[ ]]")).toBe("[[ ]]");
  });
});

describe("FG-1.6 örnek hukuki metinler (iş paketi 3.8, karar #245)", () => {
  it.each(SAMPLE_KINDS)("%s: Türkçe ve İngilizce var, doldurulacak alan içerir, kayıt kurallarına uyar", (kind) => {
    for (const locale of ["tr", "en"] as const) {
      const sample = legalSample(kind, locale, retention);
      expect(sample.title.length).toBeGreaterThanOrEqual(3);
      expect(sample.body.length).toBeGreaterThan(20);
      expect(sample.body.length).toBeLessThan(50_000);
      expect(placeholdersIn(sample.title, sample.body).length).toBeGreaterThan(0);
    }
    // İngilizce metin bilgi amaçlıdır; bağlayıcı olan Türkçesidir
    expect(legalSample(kind, "en", retention).body).toMatch(/^This English version .* the Turkish text prevails\./);
    // Bölüm başlıkları iki dilde aynı sayıda
    const headings = (body: string) => body.split("\n").filter((l) => /^\d{1,2}\.\s/.test(l)).length;
    expect(headings(legalSample(kind, "en", retention).body)).toBe(headings(legalSample(kind, "tr", retention).body));
  });

  it("saklama süreleri güncel parametrelerden yazılır", () => {
    const personnel = legalSample("kvkk_personnel", "tr", retention).body;
    expect(personnel).toContain("sona ermesinden itibaren 17 yıl saklanır");
    expect(personnel).toContain("Giriş kayıtları 400 gün, denetim kayıtları 16 yıl");
    const visitor = legalSample("kvkk_visitor", "en", retention).body;
    expect(visitor).toContain("3 years from the visit date");
    expect(visitor).toContain("4 years after the last validity ends");
    expect(visitor).toContain("5 years after the restriction is lifted");
  });

  it("aydınlatma metinleri KVKK md. 10 ve Tebliğ başlıklarını ve md. 11 haklarını içerir", () => {
    for (const kind of ["kvkk_personnel", "kvkk_visitor"] as const) {
      const tr = legalSample(kind, "tr", retention).body;
      for (const part of [
        "1. Veri sorumlusu",
        "hangi amaçlarla işlenir",
        "Hukuki sebepler",
        "nasıl toplanır",
        "kimlerle paylaşılır",
        "Yurt dışına aktarım",
        "Saklama süreleri",
        "Haklarınız",
        "Başvuru",
        "[[Yurt dışına aktarım dayanağı]]",
      ]) {
        expect(tr).toContain(part);
      }
    }
  });
});

describe("hukuki metin görünümü (iş paketi 3.8)", () => {
  const render = (body: string) => renderToStaticMarkup(createElement(LegalTextBody, { body }));

  it("numaralı kısa ilk satır başlık, madde satırları liste olur", () => {
    const html = render("1. Veri sorumlusu\nUnvan: JAPAR\n\n2. Amaçlar\nŞu amaçlarla:\n• eğitim\n- güvenlik\nson satır");
    expect(html).toContain('<p class="font-semibold">1. Veri sorumlusu</p>');
    expect(html).toContain("<li>eğitim</li><li>güvenlik</li>");
    expect(html).toContain('<p class="whitespace-pre-line">son satır</p>');
  });

  it("düz paragraf eskisi gibi gösterilir; HTML yorumlanmaz", () => {
    expect(render("Birinci satır\nikinci satır")).toBe(
      '<div class="flex flex-col gap-3 leading-relaxed"><p class="whitespace-pre-line">Birinci satır\nikinci satır</p></div>',
    );
    expect(render("1. Bu cümle noktayla biter.")).not.toContain("font-semibold");
    expect(render("<b>kalın</b> değil")).toContain("&lt;b&gt;");
  });
});

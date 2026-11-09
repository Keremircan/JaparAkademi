import { spawn } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { HOTSPOT_IMAGE, PANEL_ESTOP, SITE_ASSEMBLY } from "./data/layout";

/**
 * Örnek veri görselleri ve videoları (karar #296): hepsi burada çizilir, dışarıdan dosya indirilmez.
 * Şekiller SVG + sharp ile, yazılar ffmpeg drawtext + Geist yazı tipiyle (sunucuda sistem yazı tipi gerekmez).
 */

const FONT = path.join(process.cwd(), "src/server/pdf/fonts/Geist-Regular.ttf");

const C = {
  navy: "#1F3A5F",
  blue: "#1E5AA8",
  yellow: "#F6B800",
  red: "#C8102E",
  green: "#00843D",
  panel: "#D9DDE1",
  dark: "#2B2F33",
  light: "#F3F5F7",
  white: "#FFFFFF",
};

function ffmpeg() {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

function run(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true });
    let err = "";
    child.stderr.on("data", (d) => (err = (err + d).slice(-4000)));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg çıkış ${code}: ${err}`))));
  });
}

async function inTemp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "akademi-sample-"));
  try {
    await copyFile(FONT, path.join(dir, "font.ttf"));
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export const svgPng = (svg: string) => sharp(Buffer.from(svg)).png().toBuffer();

/** Yazı: `x` "center" ise yatayda ortalanır; sayı ise metnin ortası o noktaya gelir. */
export type Label = { text: string; cx: number | "center"; y: number; size: number; color?: string };

function drawtext(labels: Label[], fileOf: (i: number) => string, extra = "") {
  return labels
    .map((l, i) => {
      const x = l.cx === "center" ? "(w-text_w)/2" : `${l.cx}-text_w/2`;
      const color = (l.color ?? C.navy).replace("#", "0x");
      return `drawtext=fontfile=font.ttf:textfile=${fileOf(i)}:expansion=none:fontsize=${l.size}:fontcolor=${color}:x=${x}:y=${l.y}${extra ? `:${extra}` : ""}`;
    })
    .join(",");
}

/** PNG üzerine yazı ekler. */
export async function withLabels(png: Buffer, labels: Label[]): Promise<Buffer> {
  if (!labels.length) return png;
  return inTemp(async (dir) => {
    await writeFile(path.join(dir, "in.png"), png);
    await Promise.all(labels.map((l, i) => writeFile(path.join(dir, `t${i}.txt`), l.text, "utf8")));
    await run(ffmpeg(), ["-hide_banner", "-loglevel", "error", "-y", "-i", "in.png", "-vf", drawtext(labels, (i) => `t${i}.txt`), "-frames:v", "1", "out.png"], dir);
    return readFile(path.join(dir, "out.png"));
  });
}

/** Satırlara böler (drawtext satır kaydırmaz). */
export function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && (line + " " + word).length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

// ---------------------------------------------------------------------------
// KKD piktogramları (zorunluluk işareti biçimi: mavi daire, beyaz simge)
// ---------------------------------------------------------------------------

function pictogram(symbol: string) {
  return svgPng(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <rect width="800" height="800" rx="48" fill="${C.light}"/>
  <circle cx="400" cy="400" r="320" fill="${C.blue}"/>
  <circle cx="400" cy="400" r="320" fill="none" stroke="${C.white}" stroke-width="14"/>
  <g fill="${C.white}" stroke="${C.white}">${symbol}</g>
</svg>`);
}

const PPE_SYMBOLS = {
  goggles: `<path d="M150 400 Q400 250 650 400" fill="none" stroke-width="20"/>
    <rect x="215" y="345" width="165" height="120" rx="50" stroke="none"/>
    <rect x="420" y="345" width="165" height="120" rx="50" stroke="none"/>
    <rect x="370" y="385" width="60" height="22" stroke="none"/>
    <rect x="240" y="370" width="115" height="70" rx="30" fill="${C.blue}" stroke="none" opacity="0.35"/>
    <rect x="445" y="370" width="115" height="70" rx="30" fill="${C.blue}" stroke="none" opacity="0.35"/>`,
  gloves: `<g stroke="none">
    <rect x="296" y="200" width="44" height="190" rx="22"/>
    <rect x="350" y="175" width="44" height="210" rx="22"/>
    <rect x="404" y="185" width="44" height="200" rx="22"/>
    <rect x="458" y="215" width="44" height="175" rx="22"/>
    <rect x="296" y="330" width="206" height="200" rx="46"/>
    <rect x="238" y="330" width="46" height="150" rx="23" transform="rotate(-32 261 405)"/>
    <rect x="290" y="540" width="220" height="80" rx="12"/>
    <rect x="290" y="560" width="220" height="10" fill="${C.blue}"/></g>`,
  earmuffs: `<path d="M255 430 C255 220 545 220 545 430" fill="none" stroke-width="34"/>
    <ellipse cx="250" cy="450" rx="62" ry="98" stroke="none"/>
    <ellipse cx="550" cy="450" rx="62" ry="98" stroke="none"/>
    <ellipse cx="250" cy="450" rx="26" ry="54" fill="${C.blue}" stroke="none"/>
    <ellipse cx="550" cy="450" rx="26" ry="54" fill="${C.blue}" stroke="none"/>`,
  mask: `<path d="M245 330 L195 270 M555 330 L605 270 M250 470 L190 520 M550 470 L610 520" fill="none" stroke-width="14"/>
    <path d="M250 330 Q400 240 550 330 L530 480 Q400 590 270 480 Z" stroke="none"/>
    <circle cx="400" cy="440" r="44" fill="${C.blue}" stroke="none"/>
    <circle cx="400" cy="440" r="26" stroke="none"/>`,
  shoes: `<path d="M300 220 L420 220 L420 430 Q470 445 560 465 Q620 480 620 535 L620 575 L250 575 L250 520 Q250 470 300 450 Z" stroke="none"/>
    <rect x="250" y="545" width="370" height="16" fill="${C.blue}" stroke="none"/>
    <path d="M505 470 Q560 478 590 505" fill="none" stroke="${C.blue}" stroke-width="12"/>`,
  clothing: `<path d="M310 220 L365 200 Q400 245 435 200 L490 220 L600 320 L548 382 L495 338 L495 600 L305 600 L305 338 L252 382 L200 320 Z" stroke="none"/>
    <path d="M400 238 L400 600" fill="none" stroke="${C.blue}" stroke-width="8"/>
    <rect x="320" y="395" width="160" height="20" fill="${C.blue}" stroke="none" opacity="0.5"/>`,
};

export async function ppeImages() {
  const out = {} as Record<keyof typeof PPE_SYMBOLS, Buffer>;
  for (const [k, s] of Object.entries(PPE_SYMBOLS)) out[k as keyof typeof PPE_SYMBOLS] = await pictogram(s);
  return out;
}

// ---------------------------------------------------------------------------
// Kilitleme-etiketleme görselleri
// ---------------------------------------------------------------------------

export function lotoLockImage() {
  return svgPng(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" viewBox="0 0 1000 700">
  <rect width="1000" height="700" fill="${C.light}"/>
  <rect x="120" y="90" width="330" height="520" rx="18" fill="${C.panel}" stroke="#9AA3AB" stroke-width="6"/>
  <circle cx="285" cy="300" r="105" fill="#BFC5CB" stroke="#9AA3AB" stroke-width="6"/>
  <rect x="265" y="190" width="40" height="220" rx="16" fill="${C.red}" transform="rotate(90 285 300)"/>
  <rect x="380" y="282" width="150" height="36" rx="10" fill="#8A939B"/>
  <path d="M495 300 L495 250 A55 55 0 0 1 605 250 L605 330" fill="none" stroke="#7D868E" stroke-width="22"/>
  <rect x="470" y="320" width="160" height="150" rx="20" fill="${C.red}"/>
  <circle cx="550" cy="380" r="16" fill="${C.dark}"/>
  <rect x="543" y="388" width="14" height="40" rx="6" fill="${C.dark}"/>
  <path d="M600 450 Q660 470 680 520" fill="none" stroke="${C.dark}" stroke-width="5"/>
  <rect x="640" y="510" width="200" height="140" rx="12" fill="${C.white}" stroke="${C.red}" stroke-width="10"/>
  <circle cx="680" cy="540" r="10" fill="${C.light}" stroke="${C.dark}" stroke-width="3"/>
  <polygon points="740,540 790,625 690,625" fill="${C.yellow}" stroke="${C.dark}" stroke-width="5"/>
  <rect x="735" y="565" width="10" height="34" fill="${C.dark}"/>
  <circle cx="740" cy="611" r="6" fill="${C.dark}"/>
</svg>`);
}

export function lotoVerifyImage() {
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const a = (Math.PI * (210 - i * 24)) / 180;
    const x1 = 330 + Math.cos(a) * 170;
    const y1 = 330 - Math.sin(a) * 170;
    const x2 = 330 + Math.cos(a) * 195;
    const y2 = 330 - Math.sin(a) * 195;
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${C.dark}" stroke-width="${i % 5 === 0 ? 8 : 4}"/>`;
  }).join("");
  const a0 = (Math.PI * 210) / 180;
  return svgPng(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" viewBox="0 0 1000 700">
  <rect width="1000" height="700" fill="${C.light}"/>
  <circle cx="330" cy="330" r="230" fill="#BFC5CB"/>
  <circle cx="330" cy="330" r="210" fill="${C.white}"/>
  <path d="M${(330 + Math.cos(a0) * 182).toFixed(1)} ${(330 - Math.sin(a0) * 182).toFixed(1)} A182 182 0 0 1 ${(330 + Math.cos((Math.PI * 162) / 180) * 182).toFixed(1)} ${(330 - Math.sin((Math.PI * 162) / 180) * 182).toFixed(1)}" fill="none" stroke="${C.green}" stroke-width="14"/>
  ${ticks}
  <line x1="330" y1="330" x2="${(330 + Math.cos(a0) * 150).toFixed(1)}" y2="${(330 - Math.sin(a0) * 150).toFixed(1)}" stroke="${C.red}" stroke-width="12" stroke-linecap="round"/>
  <circle cx="330" cy="330" r="22" fill="${C.dark}"/>
  <rect x="300" y="560" width="60" height="90" fill="#9AA3AB"/>
  <rect x="610" y="170" width="280" height="360" rx="18" fill="${C.panel}" stroke="#9AA3AB" stroke-width="6"/>
  <circle cx="750" cy="290" r="62" fill="${C.green}" stroke="#2F6B45" stroke-width="10"/>
  <circle cx="750" cy="445" r="44" fill="${C.dark}"/>
  <rect x="742" y="405" width="16" height="44" rx="6" fill="#D0D4D8"/>
  <circle cx="860" cy="560" r="78" fill="${C.green}"/>
  <path d="M818 560 L850 594 L905 527" fill="none" stroke="${C.white}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`);
}

// ---------------------------------------------------------------------------
// Görselde işaretleme soruları: pres kumanda panosu ve saha planı
// ---------------------------------------------------------------------------

export function pressPanelImage() {
  const { width: W, height: H } = HOTSPOT_IMAGE;
  const ex = PANEL_ESTOP.cx * W;
  const ey = PANEL_ESTOP.cy * H;
  const r = PANEL_ESTOP.r;
  return svgPng(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#C9CED3"/>
  <rect x="40" y="40" width="${W - 80}" height="${H - 80}" rx="24" fill="${C.panel}" stroke="#9AA3AB" stroke-width="8"/>
  <rect x="100" y="100" width="520" height="300" rx="14" fill="#1C2733"/>
  <rect x="125" y="125" width="470" height="250" rx="6" fill="#24435F"/>
  <rect x="150" y="160" width="250" height="18" rx="4" fill="#7FB3E0"/>
  <rect x="150" y="200" width="380" height="14" rx="4" fill="#5C88B2"/>
  <rect x="150" y="232" width="320" height="14" rx="4" fill="#5C88B2"/>
  <rect x="150" y="300" width="120" height="44" rx="6" fill="#3E8E5A"/>
  <rect x="290" y="300" width="120" height="44" rx="6" fill="#D58A1E"/>
  <circle cx="720" cy="140" r="24" fill="#3FA463"/>
  <circle cx="790" cy="140" r="24" fill="#E3A21A"/>
  <circle cx="860" cy="140" r="24" fill="#B33A3A"/>
  <rect x="${ex - r * 1.55}" y="${ey - r * 1.55}" width="${r * 3.1}" height="${r * 3.1}" rx="18" fill="${C.yellow}" stroke="#B88A00" stroke-width="6"/>
  <circle cx="${ex}" cy="${ey + 10}" r="${r}" fill="#8E0B20"/>
  <circle cx="${ex}" cy="${ey}" r="${r}" fill="${C.red}"/>
  <circle cx="${ex - r * 0.3}" cy="${ey - r * 0.3}" r="${r * 0.35}" fill="#E04A5F" opacity="0.7"/>
  <circle cx="200" cy="600" r="70" fill="#9AA3AB"/>
  <circle cx="200" cy="592" r="58" fill="#2F9A55"/>
  <circle cx="520" cy="600" r="70" fill="#9AA3AB"/>
  <circle cx="520" cy="592" r="58" fill="#2F9A55"/>
  <rect x="300" y="575" width="120" height="40" rx="8" fill="#B5BCC2"/>
  <circle cx="760" cy="620" r="46" fill="${C.blue}"/>
  <circle cx="760" cy="614" r="38" fill="#3C7BD0"/>
  <circle cx="930" cy="620" r="50" fill="${C.dark}"/>
  <rect x="922" y="575" width="16" height="70" rx="6" fill="#D0D4D8" transform="rotate(35 930 620)"/>
  <rect x="1040" y="560" width="70" height="120" rx="10" fill="#AEB5BB"/>
  <circle cx="1075" cy="595" r="14" fill="${C.dark}"/>
</svg>`);
}

export async function sitePlanImage() {
  const { width: W, height: H } = HOTSPOT_IMAGE;
  const a = { x: SITE_ASSEMBLY.x * W, y: SITE_ASSEMBLY.y * H, w: SITE_ASSEMBLY.w * W, h: SITE_ASSEMBLY.h * H };
  const acx = a.x + a.w / 2;
  const acy = a.y + a.h / 2;
  const arrow = (rot: number) =>
    `<polygon points="${acx - 18},${acy - 64} ${acx + 18},${acy - 64} ${acx + 18},${acy - 44} ${acx + 32},${acy - 44} ${acx},${acy - 18} ${acx - 32},${acy - 44} ${acx - 18},${acy - 44}" fill="${C.white}" transform="rotate(${rot} ${acx} ${acy})"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#DCEBD5"/>
  <rect x="0" y="${H - 120}" width="${W}" height="70" fill="#B9BEC3"/>
  <rect x="${W - 260}" y="250" width="70" height="${H - 300}" fill="#B9BEC3"/>
  <line x1="0" y1="${H - 85}" x2="${W}" y2="${H - 85}" stroke="${C.white}" stroke-width="4" stroke-dasharray="26 22"/>
  <rect x="70" y="150" width="540" height="390" rx="8" fill="#AFBBC6" stroke="#7D8A96" stroke-width="6"/>
  <rect x="650" y="370" width="230" height="170" rx="8" fill="#C8B9A3" stroke="#9A8A72" stroke-width="6"/>
  <rect x="70" y="40" width="300" height="80" rx="8" fill="#C3CED8" stroke="#7D8A96" stroke-width="6"/>
  <rect x="${W - 170}" y="300" width="140" height="240" fill="#C4C8CC"/>
  ${[0, 1, 2, 3, 4].map((i) => `<line x1="${W - 170}" y1="${330 + i * 45}" x2="${W - 100}" y2="${330 + i * 45}" stroke="${C.white}" stroke-width="4"/>`).join("")}
  <rect x="${W - 140}" y="${H - 160}" width="60" height="40" fill="#8A939B"/>
  <rect x="620" y="200" width="70" height="70" rx="6" fill="${C.green}"/>
  <rect x="646" y="212" width="18" height="46" fill="${C.white}"/>
  <rect x="632" y="226" width="46" height="18" fill="${C.white}"/>
  <rect x="130" y="545" width="34" height="34" rx="4" fill="${C.red}"/>
  <rect x="560" y="545" width="34" height="34" rx="4" fill="${C.red}"/>
  <rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" rx="8" fill="${C.green}" stroke="#0B5E2E" stroke-width="6"/>
  ${[0, 90, 180, 270].map(arrow).join("")}
  <circle cx="${acx - 10}" cy="${acy}" r="7" fill="${C.white}"/>
  <circle cx="${acx + 10}" cy="${acy}" r="7" fill="${C.white}"/>
  <path d="M610 230 C 720 120, 820 140, ${a.x - 10} ${acy}" fill="none" stroke="${C.green}" stroke-width="8" stroke-dasharray="20 14"/>
  <polygon points="${a.x - 4},${acy} ${a.x - 30},${acy - 16} ${a.x - 30},${acy + 16}" fill="${C.green}"/>
</svg>`;
  const png = await svgPng(svg);
  return withLabels(png, [
    { text: "Üretim / Production", cx: 340, y: 330, size: 30, color: C.dark },
    { text: "Depo / Warehouse", cx: 765, y: 440, size: 24, color: C.dark },
    { text: "İdari bina / Office", cx: 220, y: 66, size: 24, color: C.dark },
    { text: "Otopark / Parking", cx: W - 100, y: 260, size: 20, color: C.dark },
    { text: "Kapı / Gate", cx: W - 110, y: H - 205, size: 20, color: C.dark },
  ]);
}

// ---------------------------------------------------------------------------
// Pozisyon kartı iş akışı şeması
// ---------------------------------------------------------------------------

export async function workflowDiagram(steps: { title: string; detail: string }[], heading: string) {
  const W = 1800;
  const H = 430;
  const box = 300;
  const gap = (W - 100 - box * steps.length) / (steps.length - 1);
  const xs = steps.map((_, i) => 50 + i * (box + gap));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${C.white}"/>
  ${xs
    .map(
      (x, i) => `<rect x="${x}" y="160" width="${box}" height="220" rx="22" fill="${C.light}" stroke="${C.navy}" stroke-width="5"/>
  <circle cx="${x + box / 2}" cy="160" r="34" fill="${C.navy}"/>
  ${i < xs.length - 1 ? `<line x1="${x + box + 8}" y1="270" x2="${x + box + gap - 22}" y2="270" stroke="${C.blue}" stroke-width="8"/><polygon points="${x + box + gap - 8},270 ${x + box + gap - 30},254 ${x + box + gap - 30},286" fill="${C.blue}"/>` : ""}`,
    )
    .join("")}
</svg>`;
  const png = await svgPng(svg);
  const labels: Label[] = [{ text: heading, cx: "center", y: 40, size: 40, color: C.navy }];
  steps.forEach((s, i) => {
    const cx = xs[i]! + box / 2;
    labels.push({ text: String(i + 1), cx, y: 142, size: 36, color: C.white });
    labels.push({ text: s.title, cx, y: 220, size: 32, color: C.navy });
    wrap(s.detail, 20).forEach((line, j) => labels.push({ text: line, cx, y: 280 + j * 34, size: 24, color: C.dark }));
  });
  return withLabels(png, labels);
}

// ---------------------------------------------------------------------------
// Pratik eğitim fotoğrafı (çizim), profil fotoğrafı, imzalar
// ---------------------------------------------------------------------------

export function practicePhoto() {
  return svgPng(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <rect width="1200" height="800" fill="#E6E9EC"/>
  <rect x="0" y="640" width="1200" height="160" fill="#C2C7CC"/>
  <rect x="330" y="80" width="70" height="580" fill="#5B6B7A"/>
  <rect x="800" y="80" width="70" height="580" fill="#5B6B7A"/>
  <rect x="300" y="60" width="600" height="90" rx="10" fill="#47596A"/>
  <rect x="520" y="150" width="160" height="120" fill="#7A8A98"/>
  <rect x="400" y="270" width="400" height="70" fill="#8796A3"/>
  <rect x="430" y="340" width="340" height="50" fill="#3A3F44"/>
  <rect x="430" y="430" width="340" height="60" fill="#3A3F44"/>
  <rect x="400" y="490" width="400" height="80" fill="#8796A3"/>
  <rect x="270" y="300" width="22" height="280" fill="${C.yellow}"/>
  <rect x="908" y="300" width="22" height="280" fill="${C.yellow}"/>
  ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<line x1="292" y1="${320 + i * 38}" x2="908" y2="${320 + i * 38}" stroke="${C.red}" stroke-width="3" stroke-dasharray="10 12" opacity="0.6"/>`).join("")}
  <rect x="960" y="520" width="190" height="60" rx="8" fill="#5B6B7A"/>
  <rect x="1040" y="580" width="30" height="80" fill="#5B6B7A"/>
  <circle cx="1000" cy="550" r="20" fill="#2F9A55"/>
  <circle cx="1110" cy="550" r="20" fill="#2F9A55"/>
  <circle cx="1055" cy="510" r="18" fill="${C.red}"/>
</svg>`);
}

export async function avatar(initials: string) {
  const png = await svgPng(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2E5E8C"/><stop offset="1" stop-color="${C.navy}"/></linearGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>
</svg>`);
  return withLabels(png, [{ text: initials, cx: "center", y: 166, size: 180, color: C.white }]);
}

/** Basit, tohumlu el yazısı benzeri imza (PNG). */
export function signaturePng(seed: number, width = 600, height = 200) {
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const pts: [number, number][] = [];
  const n = 9;
  for (let i = 0; i < n; i++) pts.push([40 + (i * (width - 120)) / (n - 1) + rnd() * 20, height / 2 + (rnd() - 0.5) * 90]);
  let d = `M${pts[0]![0].toFixed(1)} ${pts[0]![1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = pts[i]!;
    const [px, py] = pts[i - 1]!;
    d += ` C${(px + 30).toFixed(1)} ${(py - 70 * rnd()).toFixed(1)} ${(x - 30).toFixed(1)} ${(y + 70 * rnd()).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  const flourish = `M60 ${height - 40} Q ${width / 2} ${height - 10 - rnd() * 30} ${width - 50} ${height - 55}`;
  return svgPng(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${C.white}"/>
  <path d="${d}" fill="none" stroke="#1B2A4A" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${flourish}" fill="none" stroke="#1B2A4A" stroke-width="3" stroke-linecap="round"/>
</svg>`);
}

export async function signatureDataUrl(seed: number) {
  return `data:image/png;base64,${(await signaturePng(seed)).toString("base64")}`;
}

// ---------------------------------------------------------------------------
// Video: başlık + adım slaytları (ses yok)
// ---------------------------------------------------------------------------

export async function slideshowVideo(slides: string[], secondsPerSlide = 5): Promise<Buffer> {
  const W = 1280;
  const H = 720;
  return inTemp(async (dir) => {
    const files: { name: string; label: Label; enable: string }[] = [];
    slides.forEach((text, i) => {
      const start = i * secondsPerSlide;
      const end = start + secondsPerSlide;
      const title = i === 0;
      const lines = wrap(text, title ? 28 : 40);
      const size = title ? 64 : 48;
      const lineH = Math.round(size * 1.35);
      const top = Math.round(H / 2 - (lines.length * lineH) / 2);
      lines.forEach((line, j) => {
        files.push({ name: `s${i}_${j}.txt`, label: { text: line, cx: "center", y: top + j * lineH, size, color: C.white }, enable: `between(t,${start},${end - 0.01})` });
      });
    });
    await Promise.all(files.map((f) => writeFile(path.join(dir, f.name), f.label.text, "utf8")));
    const total = slides.length * secondsPerSlide;
    const filters = [
      `drawbox=x=0:y=${H - 70}:w=${W}:h=70:color=0x15283F:t=fill`,
      `drawbox=x=0:y=0:w=${W}:h=10:color=${C.yellow.replace("#", "0x")}:t=fill`,
      ...files.map((f) => drawtext([f.label], () => f.name, `enable='${f.enable}'`)),
    ];
    await writeFile(path.join(dir, "brand.txt"), "JAPAR Akademi", "utf8");
    filters.push(drawtext([{ text: "JAPAR Akademi", cx: "center", y: H - 50, size: 28, color: "#C9D6E3" }], () => "brand.txt"));
    await run(
      ffmpeg(),
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        `color=c=${C.navy.replace("#", "0x")}:s=${W}x${H}:r=24:d=${total}`,
        "-vf",
        filters.join(","),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "out.mp4",
      ],
      dir,
    );
    return readFile(path.join(dir, "out.mp4"));
  });
}

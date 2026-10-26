# JAPAR Akademi

JAPAR'a yeni başlayan personel için pozisyon bazlı eğitim, sınav ve yetkinlik onayı platformu. Ziyaretçiler ve taşeronlar için İSG bilgilendirmesi de bu platformdadır.

- Gereksinimler ve mimari: [docs/SPEC.md](docs/SPEC.md)
- Kaynak gereksinim dokümanı: [docs/source/japar-akademi-gereksinim-dokumani.pdf](docs/source/japar-akademi-gereksinim-dokumani.pdf)
- Geliştirme kuralları: [CLAUDE.md](CLAUDE.md)
- Yerel kurulum: [docs/runbooks/local-dev.md](docs/runbooks/local-dev.md)

## Durum
Faz 1 iş paketleri 1.0 (teknik temel) ve 1.1 (organizasyon ve personel: org ağacı, pozisyonlar, personel kaydı, Excel aktarımı, TC şifreleme, roller ve kapsam, KVKK onayı) tamamlandı. Sıradaki: 1.2 İçerik kütüphanesi.

## Hızlı başlangıç
```bash
npm ci && cp .env.example .env   # .env içindeki boş değerleri doldurun
npm run docker:up && npm run storage:init && npm run db:migrate && npm run db:seed
npm run dev
```

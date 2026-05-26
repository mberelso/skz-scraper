# ⚡ SKZ-Scraper

**Stromkennzeichen-Datenbank deutscher Energieversorger**

Automatisiertes System zum Herunterladen, Archivieren und Auslesen von Stromkennzeichnungs-PDFs deutscher Energieversorger, basierend auf der Anbieterliste der Bundesnetzagentur.

## Architektur

```
Next.js App (Dashboard + API)
├── DuckDuckGo-Suche → findet Stromkennzeichnungs-PDFs
├── Puppeteer → lädt Webseiten und PDFs herunter
├── Gemini Vision API → analysiert PDFs direkt (AI-First)
├── Regex-Parser → Fallback für einfache Fälle
├── Neon (PostgreSQL) → speichert Provider, Jobs, Dokumente, Energiemix
└── Supabase Storage → archiviert PDFs und Screenshots (Cloud)
```

### Parsing-Kaskade
1. **Gemini Vision** (Primär): PDF als Bild an Gemini 2.0 Flash senden
2. **Gemini Text** (Fallback 1): Extrahierten Text an Gemini senden
3. **Regex** (Fallback 2): Keyword-basierte Extraktion ohne API

## Setup

### Voraussetzungen
- Node.js 18+
- Neon.com PostgreSQL-Datenbank
- Supabase-Projekt (für Storage Bucket)
- Gemini API Key (kostenlos unter [ai.google.dev](https://ai.google.dev))

### Installation

```bash
# Dependencies installieren
npm install

# Umgebungsvariablen konfigurieren
cp .env.local.example .env.local
# → DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY eintragen

# Datenbank-Schema erstellen
npx tsx scripts/init-db.mjs

# Schema-Migration (für bestehende DBs)
npx tsx scripts/migrate-db.ts

# BNetzA-Anbieterliste importieren
npx tsx scripts/import-providers.ts
```

### Entwicklung

```bash
npm run dev
# → http://localhost:3000
```

## Nutzung

### Dashboard (Web UI)
- Alle Anbieter mit aktuellem Scraping-Status
- Strommix-Daten mit Konfidenzwert und Extraktionsmethode
- Manuelles Scraping pro Anbieter (optional mit direkter PDF-URL)
- Live-Updates während laufender Jobs

### Batch-Scraping (CLI)

```bash
# Alle aktiven Provider scrapen
npx tsx scripts/batch-scrape.ts

# Nur die ersten 10 Provider, 15s Delay
npx tsx scripts/batch-scrape.ts 10 15
```

### Daten abfragen (CLI)

```bash
npx tsx scripts/query.ts "SELECT p.name, em.* FROM energy_mix em JOIN documents d ON em.document_id = d.id JOIN scrape_jobs j ON d.job_id = j.id JOIN providers p ON j.provider_id = p.id"
```

## Datenmodell

| Tabelle | Beschreibung |
|---|---|
| `providers` | Energieversorger (Name, Adresse, Stadt, SKZ-URL) |
| `scrape_jobs` | Scraping-Jobs mit Status und Log |
| `documents` | Gespeicherte PDFs/Screenshots mit SHA256-Hash |
| `energy_mix` | Extrahierte Kennzahlen (EE, Fossil, Nuklear + Unterkategorien) |

### Energiemix-Unterkategorien
- **Erneuerbar:** Wind, Solar, Biomasse, Wasserkraft, Sonstige EE
- **Fossil:** Kohle, Erdgas, Sonstige Fossile
- **Kernenergie**
- **Umwelt:** CO₂ (g/kWh), Radioaktiver Abfall (mg/kWh)

## Tech-Stack

- **Frontend:** Next.js 16, React 19, Tailwind CSS
- **Backend:** Next.js API Routes, MariaDB
- **Scraping:** Puppeteer, DuckDuckGo-Suche
- **Parsing:** Google Gemini 2.0 Flash (Vision + Text), pdf2json, Regex
- **Datenquelle:** Bundesnetzagentur Energielieferantenliste

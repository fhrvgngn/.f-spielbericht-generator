# Spielbericht Generator

Client-seitiger PDF-Generator für die Hobbyliga Vorderland. Die Seite lädt Spiele, filtert nach Heimteam und Spieltag, und erzeugt pro Spiel eine PDF-Spielberichtvorlage im Browser.

## Stack

- PHP 8.5 (Server-seitige Seite + API-Proxy)
- Supabase REST API (Datenquelle)
- jsPDF 2.5.1 (Client-seitige PDF-Erstellung)
- HTML/CSS (UI)

## Features

- Filter nach Heimmannschaft und Spieltag
- Mobile-optimierte Tabellenansicht (Kurzform mit "PDF"-Button)
- PDF-Erstellung direkt im Browser (kein Server-Rendering)
- Dateinamen nach Schema: `<matchday>_<home>-<away>-<YYYY-MM-DD>.pdf`
- VFV-Markierung für Spieler (kleines "VFV" im Namensfeld)
- **Manuelle Vorlage:** Erstelle PDFs für Cup- oder Testspiele ohne existierende Match-Daten
  - Eigene Seite mit Formular (Typ, Datum, Uhrzeit, Heim-/Gastmannschaft)
  - Lädt Mannschaftskader automatisch aus der Datenbank
  - Fügt Match-Typ (Cup/Testspiel) zum PDF-Titel hinzu

## Caching

- Session-basierter In-Memory Cache
- TTL: 5 Minuten
- Cache pro Request-URL in der PHP-Session

## Konfiguration

Die Supabase URL und der Bearer Token sind in config.php hinterlegt. Der Token ist server-seitig und wird nicht an den Browser ausgegeben. Der verwendete Bearer Token ist der aktuell aktive anon Token von supabase. (April 2026)

## Projektstruktur

- index.php: Hauptseite und Filter-UI
- manual.php: Formularseite für manuelle PDF-Vorlagen (Cup/Testspiele)
- api.php: JSON-Endpoint für Match/Team/Player-Daten (unterstützt Match-ID oder Team-IDs)
- lib/supabase.php: Supabase-Client inkl. Cache
- assets/app.js: PDF-Erstellung und UI-Interaktionen
- assets/manual-form.js: Formular-Logik für manuelle Vorlagen
- assets/style.css: Styling

## Hinweise

- Richtigkeit der Angaben hängen von den Daten auf hobbyliga-vorderland.at ab.

### Temporärer Fix: FC Viktorsberg Namens-Swap (2026)

**Problem:** FC Viktorsberg (Team-ID: `5ed2c34b-e1cf-4427-9e7a-fcf2712cd1f8`) hat in der Saison 2026 (Season-ID: `66a1a2a5-0eac-485d-ac0c-03e0555a46f7`) die Felder `first_name` und `last_name` vertauscht.

**Lösung:** Die Datei `assets/season-2026-fixes.js` korrigiert diese Vertauschung automatisch beim Generieren der PDFs.

**Entfernung nach Saison 2026:**
1. Datei `assets/season-2026-fixes.js` löschen
2. Import in `assets/app.js` (Zeile 1) entfernen: `import { applySeasonFixes } from './season-2026-fixes.js';`
3. In `assets/app.js` in der Funktion `buildPdf()` die Zeilen mit `applySeasonFixes()` entfernen und zu ursprünglichem Code zurückkehren:
   ```javascript
   // Alt (mit Fix):
   const homePlayersFixed = applySeasonFixes(homePlayersRaw, data.teams?.home?.id || '', seasonId);
   const homePlayers = sortPlayers(homePlayersFixed);
   
   // Neu (ohne Fix):
   const homePlayers = sortPlayers(homePlayersRaw);
   ```

## Live-Server

   https://tschuta.at/tools/sbg/
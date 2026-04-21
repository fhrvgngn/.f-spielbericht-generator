# Spielbericht Generator

Client-seitiger PDF-Generator fuer die Hobbyliga Vorderland. Die Seite laedt Spiele, filtert nach Heimteam und Spieltag, und erzeugt pro Spiel eine PDF-Spielberichtvorlage im Browser.

## Stack

- PHP 8.5 (Server-seitige Seite + API-Proxy)
- Supabase REST API (Datenquelle)
- jsPDF 2.5.1 (Client-seitige PDF-Erstellung)
- HTML/CSS (UI)

## Features

- Filter nach Heimmannschaft und Spieltag
- Mobile-optimierte Tabellenansicht (Kurzform mit "PDF"-Button)
- PDF-Erstellung direkt im Browser (kein Server-Rendering)
- Dateinamen nach Schema: <matchday>_<home>-<away>-<YYYY-MM-DD>.pdf
- VLV-Markierung fuer Spieler (kleines "VLV" im Namensfeld)

## Caching

- Session-basierter In-Memory Cache
- TTL: 5 Minuten
- Cache pro Request-URL in der PHP-Session

## Lokale Entwicklung

1. In das Projektverzeichnis wechseln.
2. PHP-Server starten:
   php -S localhost:8000 -t .
3. Im Browser oeffnen:
   http://localhost:8000/

## Konfiguration

Die Supabase URL und der Bearer Token sind in config.php hinterlegt. Der Token ist server-seitig und wird nicht an den Browser ausgegeben.
Der verwendete Bearer Token ist der aktuell aktive Public Token.

## Projektstruktur

- index.php: Hauptseite und Filter-UI
- api.php: JSON-Endpoint fuer Match/Team/Player-Daten
- lib/supabase.php: Supabase-Client inkl. Cache
- assets/app.js: PDF-Erstellung und UI-Interaktionen
- assets/style.css: Styling

## Hinweise

- Wenn sich Kader aendern, werden PDF-Listen immer live aus der aktuellen API erzeugt.

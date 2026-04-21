<?php

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/supabase.php';
require_once __DIR__ . '/lib/simple_pdf.php';

$matchId = $_GET['match_id'] ?? '';
if ($matchId === '') {
    http_response_code(400);
    echo 'Missing match_id.';
    exit;
}

try {
    $matches = supabase_get('matches', [
        'id' => 'eq.' . $matchId,
        'limit' => 1,
    ]);

    if (empty($matches)) {
        http_response_code(404);
        echo 'Match not found.';
        exit;
    }

    $match = $matches[0];
    $homeTeamId = $match['home_team_id'] ?? '';
    $awayTeamId = $match['away_team_id'] ?? '';

    $teams = supabase_get('teams', [
        'id' => 'in.(' . $homeTeamId . ',' . $awayTeamId . ')',
    ]);

    $teamMap = [];
    foreach ($teams as $team) {
        if (isset($team['id'], $team['name'])) {
            $teamMap[$team['id']] = $team['name'];
        }
    }

    $homePlayers = supabase_get('players', [
        'team_id' => 'eq.' . $homeTeamId,
        'order' => 'jersey_number.asc,first_name.asc,last_name.asc',
    ]);

    $awayPlayers = supabase_get('players', [
        'team_id' => 'eq.' . $awayTeamId,
        'order' => 'jersey_number.asc,first_name.asc,last_name.asc',
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo 'Supabase error: ' . $e->getMessage();
    exit;
}

function format_match_date(?string $dateString): array
{
    if (!$dateString) {
        return ['-', '-'];
    }

    try {
        $dt = new DateTime($dateString);
        $dt->setTimezone(new DateTimeZone(date_default_timezone_get()));
        return [$dt->format('d.m.Y'), $dt->format('H:i')];
    } catch (Throwable $e) {
        return ['-', '-'];
    }
}

function format_player(array $player): string
{
    $number = $player['jersey_number'] ?? '';
    $first = $player['first_name'] ?? '';
    $last = $player['last_name'] ?? '';
    $name = trim($first . ' ' . $last);

    if ($number === '' || $number === null) {
        return $name !== '' ? $name : '-';
    }

    return $number . ' - ' . ($name !== '' ? $name : '-');
}

[$date, $time] = format_match_date($match['match_date'] ?? null);
$venue = $match['venue'] ?? '-';
$homeName = $teamMap[$homeTeamId] ?? $homeTeamId;
$awayName = $teamMap[$awayTeamId] ?? $awayTeamId;
$matchday = $match['matchday'] ?? '-';

$lines = [];
$lines[] = 'Spielbericht Vorlage';
$lines[] = 'Saison: ' . ($match['season_id'] ?? '-');
$lines[] = 'Spieltag: ' . $matchday;
$lines[] = 'Datum: ' . $date;
$lines[] = 'Uhrzeit: ' . $time;
$lines[] = 'Spielort: ' . $venue;
$lines[] = 'Heim: ' . $homeName;
$lines[] = 'Gast: ' . $awayName;
$lines[] = '';
$lines[] = 'Heimspieler:';

if (empty($homePlayers)) {
    $lines[] = '- Keine Spieler gefunden';
} else {
    foreach ($homePlayers as $player) {
        $lines[] = format_player($player);
    }
}

$lines[] = '';
$lines[] = 'Gastspieler:';

if (empty($awayPlayers)) {
    $lines[] = '- Keine Spieler gefunden';
} else {
    foreach ($awayPlayers as $player) {
        $lines[] = format_player($player);
    }
}

$pdf = simple_pdf_from_lines($lines);

$filenameBase = 'spielbericht_' . preg_replace('/[^a-zA-Z0-9_-]+/', '-', (string) $matchId);
$filename = $filenameBase . '.pdf';

header('Content-Type: application/pdf');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Content-Length: ' . strlen($pdf));

echo $pdf;

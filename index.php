<?php

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/supabase.php';

$errors = [];
$season = null;
$teams = [];
$matches = [];
$teamMap = [];

try {
    $seasons = supabase_get('seasons', [
        'select' => 'id,name,year,roster_change_end',
        'is_active' => 'eq.true',
        'order' => 'year.desc',
        'limit' => 1,
    ]);
    $season = $seasons[0] ?? null;

    if ($season && isset($season['id'])) {
        $matches = supabase_get('matches', [
            'season_id' => 'eq.' . $season['id'],
            'order' => 'matchday.asc,match_date.asc',
        ]);

        // Extract unique team IDs from matches
        $teamIds = [];
        foreach ($matches as $match) {
            if (isset($match['home_team_id'])) {
                $teamIds[$match['home_team_id']] = true;
            }
            if (isset($match['away_team_id'])) {
                $teamIds[$match['away_team_id']] = true;
            }
        }

        // Fetch only teams that have matches in this season
        if (!empty($teamIds)) {
            $teamIdList = implode(',', array_keys($teamIds));
            $teams = supabase_get('teams', [
                'id' => 'in.(' . $teamIdList . ')',
                'order' => 'name.asc',
            ]);

            foreach ($teams as $team) {
                if (isset($team['id'], $team['name'])) {
                    $teamMap[$team['id']] = [
                        'name' => $team['name'],
                        'short_name' => $team['short_name'] ?? '',
                    ];
                }
            }
        }
    }
} catch (Throwable $e) {
    $errors[] = $e->getMessage();
}

$allMatches = $matches;
$matchdays = [];
foreach ($allMatches as $match) {
    if (isset($match['matchday'])) {
        $matchdays[] = (int) $match['matchday'];
    }
}
$matchdays = array_values(array_unique($matchdays));
sort($matchdays);

$filterHomeId = $_GET['home_team_id'] ?? '';
$filterMatchday = $_GET['matchday'] ?? '';

// Validate filter inputs
if ($filterHomeId !== '' && !isset($teamMap[$filterHomeId])) {
    $errors[] = 'Nice try. Tampering with the values is smart but senseless.';
    $filterHomeId = '';
}

if ($filterMatchday !== '' && !in_array((int) $filterMatchday, $matchdays, true)) {
    $errors[] = 'Nice try. Tampering with the values is smart but senseless.';
    $filterMatchday = '';
}

$homeMatchdays = [];
if ($filterHomeId !== '') {
    foreach ($allMatches as $match) {
        if (($match['home_team_id'] ?? '') === $filterHomeId && isset($match['matchday'])) {
            $homeMatchdays[] = (int) $match['matchday'];
        }
    }
    $homeMatchdays = array_values(array_unique($homeMatchdays));
}

if ($filterHomeId !== '' || $filterMatchday !== '') {
    $matches = array_values(array_filter($matches, function (array $match) use ($filterHomeId, $filterMatchday): bool {
        $homeOk = $filterHomeId === '' || ($match['home_team_id'] ?? '') === $filterHomeId;
        $dayOk = $filterMatchday === '' || (string) ($match['matchday'] ?? '') === (string) $filterMatchday;
        return $homeOk && $dayOk;
    }));
}

// Calculate roster deadline for matches
$halfwayMatchday = 0;
$rosterDeadlineActive = false;
$isPreSeasonDeadline = false;

if (!empty($matchdays)) {
    $maxMatchday = max($matchdays);
    $halfwayMatchday = intval($maxMatchday / 2);
}

if ($season && isset($season['roster_change_end']) && !empty($allMatches)) {
    try {
        $rosterChangeEnd = new DateTime($season['roster_change_end']);
        $rosterChangeEnd->setTimezone(new DateTimeZone(date_default_timezone_get()));
        
        // Find first match date to validate if this is pre-season or mid-season deadline
        $firstMatchDate = null;
        foreach ($allMatches as $match) {
            if (isset($match['match_date'])) {
                $matchDate = new DateTime($match['match_date']);
                $matchDate->setTimezone(new DateTimeZone(date_default_timezone_get()));
                if ($firstMatchDate === null || $matchDate < $firstMatchDate) {
                    $firstMatchDate = $matchDate;
                }
            }
        }
        
        if ($firstMatchDate) {
            $now = new DateTime();
            $now->setTimezone(new DateTimeZone(date_default_timezone_get()));
            
            if ($rosterChangeEnd <= $firstMatchDate) {
                // Pre-season roster_change_end (not yet updated to mid-season)
                if ($now < $rosterChangeEnd) {
                    // Before pre-season deadline: disable all matches
                    $isPreSeasonDeadline = true;
                    $rosterDeadlineActive = true;
                } else {
                    // After pre-season deadline: disable only return round (waiting for mid-season update)
                    $isPreSeasonDeadline = false;
                    $rosterDeadlineActive = true; // Keep return round disabled
                }
            } else {
                // Mid-season roster_change_end (admin has updated it to after first match)
                $isPreSeasonDeadline = false;
                $rosterDeadlineActive = $now < $rosterChangeEnd;
            }
        }
    } catch (Throwable $e) {
        // Silently ignore invalid roster_change_end dates
    }
}


function h(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
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

function team_name(array $teamMap, ?string $teamId): string
{
    if (!$teamId) {
        return '-';
    }

    $entry = $teamMap[$teamId] ?? null;
    if (is_array($entry) && isset($entry['name'])) {
        return $entry['name'];
    }

    return $teamId;
}

function team_short_name(array $teamMap, ?string $teamId): string
{
    if (!$teamId) {
        return '-';
    }

    $entry = $teamMap[$teamId] ?? null;
    if (is_array($entry)) {
        $short = $entry['short_name'] ?? '';
        if ($short !== '') {
            return $short;
        }
        if (isset($entry['name'])) {
            return $entry['name'];
        }
    }

    return $teamId;
}

$seasonName = $season['name'] ?? 'Aktive Saison';
?>
<!doctype html>
<html lang="de">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?php echo h($seasonName); ?> - Spielbericht Generator</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <link rel="stylesheet" href="assets/style.css">
</head>
<body data-season-name="<?php echo h($seasonName); ?>">
    <main class="page">
        <header class="hero">
            <h1>Spielbericht <span class="hero-accent">Generator</span></h1>
            <p>Hobbyliga Vorderland - <?php echo h($seasonName); ?></p>
        </header>

        <?php if (!empty($errors)) : ?>
            <section class="panel error">
                <h2>Fehler</h2>
                <ul>
                    <?php foreach ($errors as $error) : ?>
                        <li><?php echo h($error); ?></li>
                    <?php endforeach; ?>
                </ul>
            </section>
        <?php endif; ?>

        <section class="panel">
            <form method="get" class="filter">
                <label for="home_team_id">Heimmannschaft</label>
                <select id="home_team_id" name="home_team_id" onchange="this.form.submit()">
                    <option value="">Alle</option>
                    <?php foreach ($teams as $team) : ?>
                        <?php $selected = ($filterHomeId !== '' && $filterHomeId === $team['id']) ? 'selected' : ''; ?>
                        <option value="<?php echo h($team['id']); ?>" <?php echo $selected; ?>>
                            <?php echo h($team['name']); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
                <div class="matchday-buttons" role="group" aria-label="Spieltag">
                    <span class="filter-label">Spieltag</span>
                    <?php
                        $allActive = $filterMatchday === '' ? 'is-active' : '';
                        $allDisabled = ($filterHomeId !== '' && empty($homeMatchdays)) ? 'disabled' : '';
                        $allTitle = $allDisabled ? 'title="Kein Heimspiel an diesem Spieltag"' : '';
                    ?>
                    <button class="matchday-btn <?php echo $allActive; ?>" type="submit" name="matchday" value="" <?php echo $allDisabled; ?> <?php echo $allTitle; ?>>
                        Alle
                    </button>
                    <?php foreach ($matchdays as $day) : ?>
                        <?php
                            $dayValue = (string) $day;
                            $dayLabel = str_pad($dayValue, 2, '0', STR_PAD_LEFT);
                            $active = ($filterMatchday !== '' && (string) $filterMatchday === $dayValue) ? 'is-active' : '';
                            $disabled = ($filterHomeId !== '' && !in_array((int) $dayValue, $homeMatchdays, true)) ? 'disabled' : '';
                            $title = $disabled ? 'title="Kein Heimspiel an diesem Spieltag"' : '';
                        ?>
                        <button class="matchday-btn <?php echo $active; ?>" type="submit" name="matchday" value="<?php echo h($dayValue); ?>" <?php echo $disabled; ?> <?php echo $title; ?>>
                            <?php echo h($dayLabel); ?>
                        </button>
                    <?php endforeach; ?>
                </div>
                <noscript>
                    <button class="btn" type="submit">Filtern</button>
                </noscript>
            </form>
        </section>

        <section class="panel">
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>ST</th>
                            <th>Datum</th>
                            <th>Uhrzeit</th>
                            <th>Ort</th>
                            <th>Heim</th>
                            <th>Gast</th>
                            <th>Aktion</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($matches)) : ?>
                            <tr>
                                <td colspan="7" class="empty">Keine Spiele gefunden.</td>
                            </tr>
                        <?php else : ?>
                            <?php foreach ($matches as $match) : ?>
                                <?php
                                    [$date, $time] = format_match_date($match['match_date'] ?? null);
                                    $homeName = team_name($teamMap, $match['home_team_id'] ?? null);
                                    $awayName = team_name($teamMap, $match['away_team_id'] ?? null);
                                    $matchday = $match['matchday'] ?? '-';
                                    $homeShort = team_short_name($teamMap, $match['home_team_id'] ?? null);
                                    $awayShort = team_short_name($teamMap, $match['away_team_id'] ?? null);
                                    $venue = $match['venue'] ?? '-';
                                    
                                    // Check if button should be disabled based on roster deadline
                                    if ($isPreSeasonDeadline) {
                                        // Pre-season: disable all matches
                                        $disableButton = $rosterDeadlineActive;
                                        $tooltipText = 'Kadernennung offen';
                                    } else {
                                        // Mid-season: disable only return round matches
                                        $isReturnRound = is_numeric($matchday) && (int) $matchday > $halfwayMatchday;
                                        $disableButton = $isReturnRound && $rosterDeadlineActive;
                                        $tooltipText = 'Nachnominierungen offen';
                                    }
                                    $disabledAttr = $disableButton ? 'disabled' : '';
                                    $titleAttr = $disableButton ? 'title="' . h($tooltipText) . '"' : '';
                                ?>
                                <tr>
                                    <td><?php echo h((string) $matchday); ?></td>
                                    <td><?php echo h($date); ?></td>
                                    <td><?php echo h($time); ?></td>
                                    <td><?php echo h($venue); ?></td>
                                    <td>
                                        <span class="team-full"><?php echo h($homeName); ?></span>
                                        <span class="team-short"><?php echo h($homeShort); ?></span>
                                    </td>
                                    <td>
                                        <span class="team-full"><?php echo h($awayName); ?></span>
                                        <span class="team-short"><?php echo h($awayShort); ?></span>
                                    </td>
                                    <td>
                                        <button class="btn" type="button" data-generate data-match-id="<?php echo h($match['id']); ?>" <?php echo $disabledAttr; ?> <?php echo $titleAttr; ?>>
                                            <span class="btn-full">Spielbericht-Vorlage erstellen</span>
                                            <span class="btn-short">PDF</span>
                                        </button>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </section>
        <footer class="page-footer">
            <p>©2026 Reinhard Lins .fahrvergnuegen.com</p>
            <p>Hinweis: Der erzeugte PDF-Inhalt hängt von der Richtigkeit der Daten auf hobbyliga-vorderland.at ab.</p>
            <p>
                <a href="https://github.com/fhrvgngn/.f-spielbericht-generator" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 0.25em; text-decoration: none; color: inherit;">
                    <img src="assets/octocat.svg" alt="GitHub" style="height: 1.6em; width: auto; vertical-align: middle;">
                    GitHub Repository
                </a>
            </p>
        </footer>
    </main>
    <script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
    <script type="module" src="assets/app.js"></script>
</body>
</html>

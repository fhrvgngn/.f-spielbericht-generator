<?php

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/supabase.php';

$errors = [];
$season = null;
$teams = [];

try {
    $seasons = supabase_get('seasons', [
        'select' => 'id,name,year',
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
        }
    }
} catch (Throwable $e) {
    $errors[] = $e->getMessage();
}

function h(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

$seasonName = $season['name'] ?? 'Aktive Saison';
$seasonId = $season['id'] ?? '';
?>
<!doctype html>
<html lang="de">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Manuelle Vorlage - <?php echo h($seasonName); ?> - Spielbericht Generator</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <link rel="stylesheet" href="assets/style.css">
</head>
<body data-season-name="<?php echo h($seasonName); ?>" data-season-id="<?php echo h($seasonId); ?>">
    <main class="page">
        <header class="hero">
            <div class="hero-header">
                <div>
                    <h1>Manuelle <span class="hero-accent">Vorlage</span></h1>
                    <p>Hobbyliga Vorderland - <?php echo h($seasonName); ?></p>
                </div>
                <a href="index.php" class="btn-secondary">← Zurück</a>
            </div>
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
            <h2>Spielbericht-Vorlage erstellen</h2>
            <p style="margin-bottom: 24px; color: var(--muted);">
                Erstellen Sie eine leere Spielbericht-Vorlage mit den Mannschaftskadern.
            </p>

            <form id="manual-form" class="manual-form">
                <div class="form-group">
                    <label>Typ</label>
                    <div class="radio-group">
                        <label class="radio-label">
                            <input type="radio" name="match_type" value="Cup" checked>
                            Cup
                        </label>
                        <label class="radio-label">
                            <input type="radio" name="match_type" value="Testspiel">
                            Testspiel
                        </label>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="match_date">Datum</label>
                        <input type="date" id="match_date" name="match_date" required>
                    </div>

                    <div class="form-group">
                        <label for="match_time">Uhrzeit</label>
                        <input type="time" id="match_time" name="match_time" value="18:00" required>
                    </div>
                </div>

                <div class="form-group">
                    <label for="home_team_id">Heimmannschaft</label>
                    <select id="home_team_id" name="home_team_id" required>
                        <option value="">Bitte wählen...</option>
                        <?php foreach ($teams as $team) : ?>
                            <option value="<?php echo h($team['id']); ?>" 
                                    data-name="<?php echo h($team['name']); ?>"
                                    data-short="<?php echo h($team['short_name'] ?? ''); ?>">
                                <?php echo h($team['name']); ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <div class="form-group">
                    <label for="away_team_id">Gastmannschaft</label>
                    <select id="away_team_id" name="away_team_id" required>
                        <option value="">Bitte wählen...</option>
                        <?php foreach ($teams as $team) : ?>
                            <option value="<?php echo h($team['id']); ?>"
                                    data-name="<?php echo h($team['name']); ?>"
                                    data-short="<?php echo h($team['short_name'] ?? ''); ?>">
                                <?php echo h($team['name']); ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <button type="submit" class="btn" id="submit-btn">
                    <span class="btn-full">PDF erstellen</span>
                    <span class="btn-short">PDF</span>
                </button>
            </form>
        </section>

        <footer class="page-footer">
            <p>©2026 Reinhard Lins .fahrvergnuegen.com</p>
            <p>Hinweis: Der erzeugte PDF-Inhalt hängt von der Richtigkeit der Daten auf <a href="https://hobbyliga-vorderland.at" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 0.25em; text-decoration: none; color: inherit;">hobbyliga-vorderland.at</a> ab.</p>
            <p>
                <a href="https://github.com/fhrvgngn/.f-spielbericht-generator" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 0.25em; text-decoration: none; color: inherit;">
                    <img src="assets/octocat.svg" alt="GitHub" style="height: 1.6em; width: auto; vertical-align: middle;">
                    GitHub Repository
                </a>
            </p>
        </footer>
    </main>

    <script type="text/javascript" src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" integrity="sha512-qZvrmS2ekKPF2mSznTQsxqPgnpkI4DNTlrdUmTzrDgektczlKNRRhy5X5AAOnx5S09ydFYWWNSfcEqDTTHgtNA==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
    <script type="module" src="assets/manual-form.js"></script>
</body>
</html>

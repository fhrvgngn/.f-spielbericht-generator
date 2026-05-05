<?php

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/supabase.php';

header('Content-Type: application/json');

$matchId = $_GET['match_id'] ?? '';
$homeTeamId = $_GET['home_team_id'] ?? '';
$awayTeamId = $_GET['away_team_id'] ?? '';
$matchDate = $_GET['match_date'] ?? '';
$seasonId = $_GET['season_id'] ?? '';
$includeSuspensions = ($_GET['include_suspensions'] ?? 'false') === 'true';

// Support two modes:
// 1. Match mode: match_id provided, fetch match data + teams + players
// 2. Manual mode: home_team_id + away_team_id provided, fetch teams + players only
if ($matchId === '' && ($homeTeamId === '' || $awayTeamId === '')) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing match_id or (home_team_id and away_team_id)']);
    exit;
}

try {
    $match = null;

    // Match mode: fetch match data
    if ($matchId !== '') {
        $matches = supabase_get('matches', [
            'id' => 'eq.' . $matchId,
            'limit' => 1,
        ]);

        if (empty($matches)) {
            http_response_code(404);
            echo json_encode(['error' => 'Match not found']);
            exit;
        }

        $match = $matches[0];
        $homeTeamId = $match['home_team_id'] ?? '';
        $awayTeamId = $match['away_team_id'] ?? '';
    }

    $teams = supabase_get('teams', [
        'id' => 'in.(' . $homeTeamId . ',' . $awayTeamId . ')',
    ]);

    $teamMap = [];
    foreach ($teams as $team) {
        if (isset($team['id'], $team['name'])) {
            $teamMap[$team['id']] = [
                'name' => $team['name'],
                'short_name' => $team['short_name'] ?? '',
            ];
        }
    }

    $homePlayers = supabase_get('players', [
        'team_id' => 'eq.' . $homeTeamId,
        'order' => 'last_name.asc,first_name.asc',
    ]);

    $awayPlayers = supabase_get('players', [
        'team_id' => 'eq.' . $awayTeamId,
        'order' => 'last_name.asc,first_name.asc',
    ]);

    // Fetch suspensions if requested (experimental feature)
    $suspensions = [];
    $allMatches = [];
    
    // Determine season_id: from match or from GET parameter
    $effectiveSeasonId = '';
    if ($match !== null && isset($match['season_id'])) {
        $effectiveSeasonId = $match['season_id'];
    } elseif ($seasonId !== '') {
        $effectiveSeasonId = $seasonId;
    }
    
    if ($includeSuspensions && $effectiveSeasonId !== '') {
        // Fetch all active suspensions for this season
        $suspensions = supabase_get('suspensions', [
            'season_id' => 'eq.' . $effectiveSeasonId,
            'is_active' => 'eq.true',
        ]);

        // Fetch all matches of this season for suspension calculation
        // Only league matches (matchday != null) ordered by date
        $allMatches = supabase_get('matches', [
            'season_id' => 'eq.' . $effectiveSeasonId,
            'matchday' => 'not.is.null',
            'order' => 'match_date.asc,matchday.asc',
        ]);
    }

    $response = [
        'teams' => [
            'home' => [
                'id' => $homeTeamId,
                'name' => $teamMap[$homeTeamId]['name'] ?? $homeTeamId,
                'short_name' => $teamMap[$homeTeamId]['short_name'] ?? '',
            ],
            'away' => [
                'id' => $awayTeamId,
                'name' => $teamMap[$awayTeamId]['name'] ?? $awayTeamId,
                'short_name' => $teamMap[$awayTeamId]['short_name'] ?? '',
            ],
        ],
        'players' => [
            'home' => $homePlayers,
            'away' => $awayPlayers,
        ],
    ];

    // Include match data only in match mode
    if ($match !== null) {
        $response['match'] = $match;
    }

    // Include match_date for manual mode (used for suspension calculation)
    if ($matchDate !== '') {
        $response['match_date'] = $matchDate;
    }

    // Include suspensions data if requested
    if ($includeSuspensions) {
        $response['suspensions'] = $suspensions;
        $response['all_matches'] = $allMatches;
    }

    echo json_encode($response);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

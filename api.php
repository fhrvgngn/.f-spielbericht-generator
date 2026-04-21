<?php

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/supabase.php';

header('Content-Type: application/json');

$matchId = $_GET['match_id'] ?? '';
if ($matchId === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing match_id']);
    exit;
}

try {
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
        'order' => 'jersey_number.asc,first_name.asc,last_name.asc',
    ]);

    $awayPlayers = supabase_get('players', [
        'team_id' => 'eq.' . $awayTeamId,
        'order' => 'jersey_number.asc,first_name.asc,last_name.asc',
    ]);

    echo json_encode([
        'match' => $match,
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
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

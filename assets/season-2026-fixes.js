// TEMPORARY FIX FOR 2026 SEASON
// TODO: Remove this file after 2026 season ends
// Also remove the import in app.js

const SEASON_2026_ID = '66a1a2a5-0eac-485d-ac0c-03e0555a46f7';
const FC_VIKTORSBERG_TEAM_ID = '5ed2c34b-e1cf-4427-9e7a-fcf2712cd1f8';

/**
 * FC Viktorsberg has swapped first_name/last_name fields in their 2026 season data.
 * This function corrects the swap for this specific team in this specific season.
 * 
 * @param {Array} players - Array of player objects
 * @param {string} teamId - The team ID
 * @param {string} seasonId - The season ID from match data
 * @returns {Array} Players with corrected names if applicable
 */
export function applySeasonFixes(players, teamId, seasonId) {
    // Only apply fix for FC Viktorsberg in 2026 season
    if (seasonId !== SEASON_2026_ID || teamId !== FC_VIKTORSBERG_TEAM_ID) {
        return players;
    }

    // Swap first_name and last_name for this team
    return players.map(player => ({
        ...player,
        first_name: player.last_name,
        last_name: player.first_name,
    }));
}

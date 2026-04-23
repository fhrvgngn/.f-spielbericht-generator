import { buildPdf, buildFilename } from './app.js';

const form = document.getElementById('manual-form');
const submitBtn = document.getElementById('submit-btn');
const homeTeamSelect = document.getElementById('home_team_id');
const awayTeamSelect = document.getElementById('away_team_id');
const seasonName = document.body?.dataset?.seasonName || '';
const seasonId = document.body?.dataset?.seasonId || '';

// Prevent selecting the same team for home and away
if (homeTeamSelect && awayTeamSelect) {
    homeTeamSelect.addEventListener('change', () => {
        updateTeamOptions(homeTeamSelect, awayTeamSelect);
    });

    awayTeamSelect.addEventListener('change', () => {
        updateTeamOptions(awayTeamSelect, homeTeamSelect);
    });
}

function updateTeamOptions(changedSelect, otherSelect) {
    const selectedValue = changedSelect.value;
    
    // Enable all options in the other select first
    Array.from(otherSelect.options).forEach(option => {
        if (option.value !== '') {
            option.disabled = false;
        }
    });
    
    // Disable the selected team in the other select
    if (selectedValue) {
        const optionToDisable = otherSelect.querySelector(`option[value="${selectedValue}"]`);
        if (optionToDisable) {
            optionToDisable.disabled = true;
            
            // If the other select has the same value selected, reset it
            if (otherSelect.value === selectedValue) {
                otherSelect.value = '';
            }
        }
    }
}

if (form && submitBtn) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(form);
        const matchType = formData.get('match_type');
        const matchDate = formData.get('match_date');
        const matchTime = formData.get('match_time');
        const homeTeamId = formData.get('home_team_id');
        const awayTeamId = formData.get('away_team_id');

        // Validation
        if (!matchType || !matchDate || !matchTime || !homeTeamId || !awayTeamId) {
            alert('Bitte füllen Sie alle Felder aus.');
            return;
        }

        if (homeTeamId === awayTeamId) {
            alert('Heim- und Gastmannschaft müssen unterschiedlich sein.');
            return;
        }

        // Disable button and show loading
        submitBtn.disabled = true;
        setButtonText(submitBtn, 'PDF wird erstellt...', '...');

        try {
            // Fetch team data and rosters using existing api.php
            const response = await fetch(
                `api.php?home_team_id=${encodeURIComponent(homeTeamId)}&away_team_id=${encodeURIComponent(awayTeamId)}`
            );
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Fehler beim Laden der Mannschaftsdaten');
            }

            // Combine date and time into ISO string
            const combinedDateTime = new Date(`${matchDate}T${matchTime}:00`).toISOString();

            // Construct payload matching api.php structure
            const payload = {
                match: {
                    id: null,
                    matchday: null,
                    season_id: seasonId,
                    match_date: combinedDateTime,
                    home_team_id: homeTeamId,
                    away_team_id: awayTeamId,
                },
                teams: data.teams,
                players: data.players,
            };

            // Generate PDF with match type
            const pdf = buildPdf(payload, seasonName, matchType);
            const filename = buildFilename(payload);
            pdf.save(filename);

            // Send telemetry
            const event = {
                ts: new Date().toISOString(),
                match_id: null,
                matchday: null,
                season_id: seasonId,
                home: { id: data.teams.home.id, name: data.teams.home.name },
                away: { id: data.teams.away.id, name: data.teams.away.name },
                match_type: matchType,
                event: 'pdf_generated_manual',
            };
            const body = JSON.stringify(event);
            const ok = navigator.sendBeacon('telemetry.php', new Blob([body], { type: 'application/json' }));
            if (!ok) {
                fetch('telemetry.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body,
                    keepalive: true,
                }).catch(() => {}); // Silently ignore telemetry failures
            }

            // Reset form on success
            form.reset();
            
            // Re-enable all team options after reset
            if (homeTeamSelect && awayTeamSelect) {
                Array.from(homeTeamSelect.options).forEach(option => {
                    if (option.value !== '') option.disabled = false;
                });
                Array.from(awayTeamSelect.options).forEach(option => {
                    if (option.value !== '') option.disabled = false;
                });
            }
        } catch (error) {
            alert(`Fehler beim Erstellen: ${error.message}`);
        } finally {
            submitBtn.disabled = false;
            setButtonText(submitBtn, 'PDF erstellen', 'PDF');
        }
    });
}

function setButtonText(button, fullText, shortText) {
    const fullSpan = button.querySelector('.btn-full');
    const shortSpan = button.querySelector('.btn-short');

    if (fullSpan && shortSpan) {
        fullSpan.textContent = fullText;
        shortSpan.textContent = shortText;
    } else {
        button.textContent = fullText;
    }
}

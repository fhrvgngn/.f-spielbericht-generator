const { jsPDF } = window.jspdf || {};
if (!jsPDF) {
    console.error('jsPDF library not loaded');
}

const seasonName = document.body?.dataset?.seasonName || '';
const defaultRefereeFee = parseInt(document.body?.dataset?.refereeFee || '80', 10);

// Initialize PDF generation for existing match buttons
const buttons = document.querySelectorAll('[data-generate]');
buttons.forEach((button) => {
    button.addEventListener('click', async () => {
        const matchId = button.dataset.matchId;
        if (!matchId) {
            return;
        }

        button.disabled = true;
        setButtonText(button, 'PDF wird erstellt...', '...');

        try {
            // Check if suspensions feature is enabled
            const includeSuspensions = localStorage.getItem('includeSuspensions') === 'true';
            let apiUrl = `api.php?match_id=${encodeURIComponent(matchId)}`;
            if (includeSuspensions) {
                apiUrl += '&include_suspensions=true';
            }
            
            const response = await fetch(apiUrl);
            const payload = await response.json();

            if (!response.ok) {
                throw new Error(payload.error || 'Unbekannter Fehler');
            }

            const pdf = buildPdf(payload, seasonName);
            const filename = buildFilename(payload);
            pdf.save(filename);

            // Send telemetry (fire-and-forget)
            const event = {
                ts: new Date().toISOString(),
                match_id: payload.match?.id,
                matchday: payload.match?.matchday,
                season_id: payload.match?.season_id,
                home: { id: payload.teams?.home?.id, name: payload.teams?.home?.name },
                away: { id: payload.teams?.away?.id, name: payload.teams?.away?.name },
                suspensions_enabled: includeSuspensions,
                event: 'pdf_generated',
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
        } catch (error) {
            alert(`Fehler beim Erstellen: ${error.message}`);
        } finally {
            button.disabled = false;
            setButtonText(button, 'Spielbericht-Vorlage erstellen', 'PDF');
        }
    });
});

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

/**
 * Calculate which players are suspended for this match
 * Returns a Map of player_id -> suspension info
 */
function calculateSuspendedPlayers(data) {
    const suspendedPlayers = new Map();
    
    // Check if suspensions data is available
    if (!data.suspensions || !data.all_matches) {
        return suspendedPlayers;
    }

    // Get current matchday
    const currentMatchday = data.match?.matchday;
    if (!currentMatchday) {
        return suspendedPlayers;
    }

    // Process each suspension
    for (const suspension of data.suspensions) {
        // Skip if suspension is missing data
        if (!suspension.team_id || !suspension.player_id) {
            continue;
        }

        const matchesSuspended = suspension.matches_suspended || 0;
        if (matchesSuspended <= 0) {
            continue;
        }

        const teamId = suspension.team_id;
        const triggeredMatchId = suspension.triggered_by_match_id;

        // Finde das Match, das die Sperre ausgelöst hat
        const triggeredMatch = data.all_matches.find(m => m.id === triggeredMatchId);
        if (!triggeredMatch || !triggeredMatch.matchday) continue;
        const triggeredMatchday = triggeredMatch.matchday;

        // Finde alle Ligaspiele dieses Teams nach dem Auslöser-Match
        const teamMatches = data.all_matches
            .filter(match => {
                if (!match.matchday) return false;
                const isTeamMatch = match.home_team_id === teamId || match.away_team_id === teamId;
                return isTeamMatch && match.matchday > triggeredMatchday;
            })
            .sort((a, b) => a.matchday - b.matchday);

        // Die nächsten N Ligaspiele sind gesperrt
        const suspendedMatches = teamMatches.slice(0, matchesSuspended);
        const suspendedMatchdays = suspendedMatches.map(m => m.matchday);

        // Ist das aktuelle Match einer der gesperrten Spieltage?
        if (suspendedMatchdays.includes(currentMatchday)) {
            // Für die Anzeige: Start- und Endspieltag der Sperre
            const start_matchday = suspendedMatchdays[0] || 0;
            const end_matchday = suspendedMatchdays[suspendedMatchdays.length - 1] || 0;
            suspendedPlayers.set(suspension.player_id, {
                reason: suspension.reason || 'Keine Angabe',
                matches_suspended: matchesSuspended,
                current_match_number: suspendedMatchdays.indexOf(currentMatchday) + 1,
                start_matchday,
                end_matchday,
            });
        }
    }

    return suspendedPlayers;
}

export function buildPdf(data, seasonLabel, matchType = null, refereeFee = null) {
    // Use provided refereeFee, or fall back to default from config
    const finalRefereeFee = refereeFee !== null ? refereeFee : defaultRefereeFee;
    
    const doc = new jsPDF({
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait',
    });

    doc.setProperties({
        title: `Spielbericht Hobbyliga ${seasonLabel}`,
        author: '.fahrvergnuegen',
        creator: 'Spielbericht Generator',
    });

    const rows = 30;

    const homePlayersRaw = Array.isArray(data.players?.home) ? data.players.home : [];
    const awayPlayersRaw = Array.isArray(data.players?.away) ? data.players.away : [];
    const homePlayersNormalized = normalizePlayerNames(homePlayersRaw);
    const awayPlayersNormalized = normalizePlayerNames(awayPlayersRaw);
    const homePlayers = sortPlayers(homePlayersNormalized);
    const awayPlayers = sortPlayers(awayPlayersNormalized);
    const creationStamp = buildCreationStamp();
    const goalsByPlayer = groupGoalsByPlayer(data.goals);
    const cards = Array.isArray(data.cards) ? data.cards : [];

    // Calculate suspended players (experimental feature)
    const suspendedPlayers = calculateSuspendedPlayers(data);

    renderPage(doc, data, seasonLabel, homePlayers, awayPlayers, rows, matchType, suspendedPlayers, finalRefereeFee, creationStamp, goalsByPlayer, cards);

    return doc;
}

function groupGoalsByPlayer(goals) {
    const goalsByPlayer = new Map();

    for (const goal of Array.isArray(goals) ? goals : []) {
        if (!goal?.player_id) {
            continue;
        }

        const playerGoals = goalsByPlayer.get(goal.player_id) || { count: 0, minutes: [] };
        playerGoals.count += 1;
        const isOwnGoal = goal.is_own_goal === true || goal.is_own_goal === 1 || goal.is_own_goal === 'true';
        const ownGoalSuffix = isOwnGoal ? ' ET' : '';
        if (goal.minute !== null && goal.minute !== undefined && goal.minute !== '') {
            playerGoals.minutes.push(`${goal.minute}${ownGoalSuffix}`);
        } else if (isOwnGoal) {
            playerGoals.minutes.push('ET');
        }
        goalsByPlayer.set(goal.player_id, playerGoals);
    }

    return goalsByPlayer;
}

function normalizePlayerNames(players) {
    return (Array.isArray(players) ? players : []).map((player) => ({
        ...player,
        first_name: String(player?.first_name || '').trim(),
        last_name: String(player?.last_name || '').trim(),
    }));
}

function buildCreationStamp(date = new Date()) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${hour}${minute}${day}${month}`;
}

function sortPlayers(players) {
    return [...players].sort((a, b) => {
        const aLast = (a.last_name || '').toLowerCase();
        const bLast = (b.last_name || '').toLowerCase();
        const lastCompare = aLast.localeCompare(bLast, 'de');
        if (lastCompare !== 0) {
            return lastCompare;
        }

        const aFirst = (a.first_name || '').toLowerCase();
        const bFirst = (b.first_name || '').toLowerCase();
        return aFirst.localeCompare(bFirst, 'de');
    });
}

export function buildFilename(data) {
        const match = data.match || {};
        const teams = data.teams || {};
        const matchdayValue = String(match.matchday ?? '').padStart(2, '0');
        const homeShort = sanitizeSegment(teams.home?.short_name || teams.home?.name || 'HOME');
        const awayShort = sanitizeSegment(teams.away?.short_name || teams.away?.name || 'AWAY');
        const datePart = sanitizeSegment(extractDate(match.match_date || '')) || 'date';

        return `${matchdayValue}_${homeShort}-${awayShort}-${datePart}.pdf`;
    }

function extractDate(dateString) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

function sanitizeSegment(value) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\p{L}\p{N}_-]/gu, '')
        .replace(/-+/g, '-');
}

function renderPage(doc, data, seasonLabel, homePlayers, awayPlayers, rows, matchType = null, suspendedPlayers = null, refereeFee = defaultRefereeFee, creationStamp = '', goalsByPlayer = new Map(), cards = []) {
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 12;
    let y = 12;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    const titleSuffix = matchType ? ` - ${matchType}` : '';
    doc.text(`SPIELBERICHT - HOBBYLIGA VORDERLAND ${seasonLabel}${titleSuffix}`, margin, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('https://tschuta.at/tools/sbg/', pageWidth - margin, y - 1.5, { align: 'right' });
    doc.setFontSize(5);
    doc.text(creationStamp, pageWidth - margin, y + 1.3, { align: 'right' });

    y += 8;
    drawLabelLine(doc, margin, y, 'Datum', 30, ':');
    drawLabelLine(doc, 60, y, 'Beginn', 20, ':');
    drawLabelLineCenteredColon(doc, 95, y, 'Halbzeit', 20);
    drawLabelLineCenteredColon(doc, 135, y, 'Endstand', 25);
    
    // Display matchday number (if available)
    const matchday = data.match?.matchday;
    if (matchday) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(`Spieltag: ${matchday}`, pageWidth - margin, y, { align: 'right' });
    }

    y += 10;
    drawLabelLine(doc, margin, y, 'Heim', 70);
    drawLabelLine(doc, 115, y, 'Gast', 70);

    y += 8;
    const tableTop = y;
    const leftX = margin;
    const tableWidth = 90;
    const gap = 6;
    const rightX = leftX + tableWidth + gap;
    const headerHeight = 6;

    const cardTableHeight = 28;
    const signatureHeight = 12;
    const sectionGap = 6;
    const footerY = pageHeight - 12;
    const cardsTop = footerY - sectionGap - cardTableHeight;
    const signatureTop = cardsTop - sectionGap - signatureHeight;

    const rowHeight = (signatureTop - tableTop - headerHeight) / rows;

    drawPlayerTable(doc, leftX, tableTop, tableWidth, headerHeight, rowHeight, rows, 'Nummer', 'Name', 'Tore');
    drawPlayerTable(doc, rightX, tableTop, tableWidth, headerHeight, rowHeight, rows, 'Nummer', 'Name', 'Tore');

    fillPlayers(doc, leftX, tableTop, tableWidth, headerHeight, rowHeight, rows, homePlayers, suspendedPlayers, goalsByPlayer);
    fillPlayers(doc, rightX, tableTop, tableWidth, headerHeight, rowHeight, rows, awayPlayers, suspendedPlayers, goalsByPlayer);

    doc.rect(leftX, signatureTop, tableWidth, signatureHeight);
    doc.rect(rightX, signatureTop, tableWidth, signatureHeight);
    doc.setFontSize(6);
    doc.text('Unterschrift Spielführer HEIM', leftX + 2, signatureTop + 10);
    doc.text('Unterschrift Spielführer GAST', rightX + 2, signatureTop + 10);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Karten', leftX, cardsTop - 2);
    doc.setFont('helvetica', 'normal');

    drawCardTable(doc, leftX, cardsTop, tableWidth, cardTableHeight);
    drawCardTable(doc, rightX, cardsTop, tableWidth, cardTableHeight);
    fillCardTable(doc, leftX, cardsTop, tableWidth, cardTableHeight, cards, data.teams?.home?.id || '', homePlayers);
    fillCardTable(doc, rightX, cardsTop, tableWidth, cardTableHeight, cards, data.teams?.away?.id || '', awayPlayers);

    doc.setFontSize(8);
    doc.text(`Gebühr erhalten: ${refereeFee.toFixed(0)},- EUR`, leftX, footerY);
    doc.setFontSize(6);
    doc.text('Unterschrift Schiedsrichter', rightX, footerY);
    doc.line(rightX, footerY + 1.5, rightX + tableWidth, footerY + 1.5);

    fillHeaderValues(doc, data, seasonLabel);
}

function fillHeaderValues(doc, data) {
    const match = data.match || {};
    const teams = data.teams || {};
    const dateInfo = formatMatchDate(match.match_date || '');
    const scores = calculateMatchScores(data);

    doc.setFontSize(9);
    doc.text(dateInfo.date || '', 28, 20.2);
    doc.text(dateInfo.time || '', 78, 20.2);
    doc.text(teams.home?.name || '', 24, 30.2);
    doc.text(teams.away?.name || '', 125, 30.2);

    const halfTimeColonX = getScoreColonX(doc, 95, 'Halbzeit', 20);
    const fullTimeColonX = getScoreColonX(doc, 135, 'Endstand', 25);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    drawScoreAroundColon(doc, scores.halfTime, halfTimeColonX, 20.2);
    drawScoreAroundColon(doc, scores.fullTime, fullTimeColonX, 20.2);
    doc.setFont('helvetica', 'normal');
}

function getScoreColonX(doc, x, label, lineWidth) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    return x + doc.getTextWidth(label) + 1 + lineWidth / 2;
}

function drawScoreAroundColon(doc, score, colonX, y) {
    if (!score) {
        return;
    }

    const [homeScore, awayScore] = score.split(':').map((value) => value.trim());
    doc.text(homeScore, colonX - 2, y, { align: 'right' });
    doc.text(awayScore, colonX + 2, y);
}

function calculateMatchScores(data) {
    const hasConfirmedPlayedMatch = isConfirmedPlayedMatch(data.match);
    const match = data.match || {};
    const homeTeamId = data.teams?.home?.id || '';
    const awayTeamId = data.teams?.away?.id || '';
    const goals = Array.isArray(data.goals) ? data.goals : [];
    const halfTime = { home: 0, away: 0 };
    let hasInvalidGoalMinute = false;

    for (const goal of goals) {
        const minute = Number.parseInt(String(goal?.minute ?? ''), 10);
        if (!Number.isFinite(minute) || minute <= 0 || minute > 130) {
            hasInvalidGoalMinute = true;
            continue;
        }
        if (minute > 45) {
            continue;
        }

        const isOwnGoal = goal.is_own_goal === true
            || goal.is_own_goal === 1
            || goal.is_own_goal === '1'
            || goal.is_own_goal === 'true';
        const scoringTeamId = isOwnGoal
            ? (goal.team_id === homeTeamId ? awayTeamId : homeTeamId)
            : goal.team_id;

        if (scoringTeamId === homeTeamId) {
            halfTime.home += 1;
        } else if (scoringTeamId === awayTeamId) {
            halfTime.away += 1;
        }
    }

    return {
        halfTime: hasConfirmedPlayedMatch && !hasInvalidGoalMinute ? `${halfTime.home} : ${halfTime.away}` : '',
        fullTime: hasConfirmedPlayedMatch ? readMatchScore(match, [
            ['home_score', 'away_score'],
            ['full_time_home_score', 'full_time_away_score'],
            ['fulltime_home_score', 'fulltime_away_score'],
            ['final_home_score', 'final_away_score'],
            ['score'],
            ['result'],
        ]) : '',
    };
}

function readMatchScore(match, fieldPairs) {
    for (const fields of fieldPairs) {
        if (fields.length === 1) {
            const score = match[fields[0]];
            if (typeof score === 'string' && /^\s*\d+\s*:\s*\d+\s*$/.test(score)) {
                return score.trim().replace(/\s*:\s*/, ' : ');
            }
            continue;
        }

        const homeScore = match[fields[0]];
        const awayScore = match[fields[1]];
        if (isScoreValue(homeScore) && isScoreValue(awayScore)) {
            return `${homeScore} : ${awayScore}`;
        }
    }

    return '';
}

function isScoreValue(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function isConfirmedPlayedMatch(match) {
    if (!match?.id) {
        return false;
    }

    const isConfirmed = String(match.status || '').toLowerCase() === 'confirmed';

    return isConfirmed;
}

function formatMatchDate(dateString) {
    if (!dateString) {
        return { date: '', time: '' };
    }

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
        return { date: '', time: '' };
    }

    const datePart = date.toLocaleDateString('de-AT');
    const timePart = date.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });

    return { date: datePart, time: timePart };
}

function drawLabelLine(doc, x, y, label, lineWidth, suffix = '') {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(label, x, y);
    const labelWidth = doc.getTextWidth(label + suffix);
    doc.text(suffix, x + labelWidth - doc.getTextWidth(suffix), y);
    const lineX = x + labelWidth + 1;
    doc.line(lineX, y + 0.5, lineX + lineWidth, y + 0.5);
}

function drawLabelLineCenteredColon(doc, x, y, label, lineWidth) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(label, x, y);
    const labelWidth = doc.getTextWidth(label);
    const lineX = x + labelWidth + 1;
    doc.line(lineX, y + 0.5, lineX + lineWidth, y + 0.5);
    doc.setFont('helvetica', 'bold');
    doc.text(':', lineX + lineWidth / 2, y - 0.2, { align: 'center' });
    doc.setFont('helvetica', 'normal');
}

function drawPlayerTable(doc, x, y, width, headerHeight, rowHeight, rows, numberLabel, nameLabel, goalsLabel) {
    doc.rect(x, y, width, headerHeight + rowHeight * rows);
    doc.line(x, y + headerHeight, x + width, y + headerHeight);

    const numWidth = 16;
    const goalsWidth = 26;
    const nameWidth = width - numWidth - goalsWidth;

    doc.line(x + numWidth, y, x + numWidth, y + headerHeight + rowHeight * rows);
    doc.line(x + numWidth + nameWidth, y, x + numWidth + nameWidth, y + headerHeight + rowHeight * rows);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(numberLabel, x + 2, y + 4);
    doc.text(nameLabel, x + numWidth + 2, y + 4);
    doc.text(goalsLabel, x + numWidth + nameWidth + 2, y + 4);
    doc.setFont('helvetica', 'normal');
    doc.text('Minute', x + numWidth + nameWidth + 14, y + 4);

    for (let i = 1; i <= rows; i += 1) {
        const rowY = y + headerHeight + i * rowHeight;
        doc.line(x, rowY, x + width, rowY);
    }
}

function fillPlayers(doc, x, y, width, headerHeight, rowHeight, rows, players, suspendedPlayers = null, goalsByPlayer = new Map()) {
    const numWidth = 16;
    const goalsWidth = 26;
    const nameWidth = width - numWidth - goalsWidth;
    doc.setFontSize(8);

    const safePlayers = Array.isArray(players) ? players : [];
    const visible = safePlayers.slice(0, rows);

    visible.forEach((player, index) => {
        const rowY = y + headerHeight + rowHeight * index + rowHeight * 0.7;
        const rowBottom = y + headerHeight + rowHeight * (index + 1);
        const name = `${player.last_name || ''} ${player.first_name || ''}`.trim();

        doc.text(name, x + numWidth + 2, rowY);

        const playerGoals = goalsByPlayer.get(player.id);
        if (playerGoals) {
            doc.setFontSize(6);
            doc.text(String(playerGoals.count), x + numWidth + nameWidth + 2, rowY);
            doc.text(playerGoals.minutes.join(', '), x + width - 1.5, rowY, { align: 'right' });
            doc.setFontSize(8);
        }

        // Check if player is suspended
        const suspension = suspendedPlayers?.get(player.id);
        if (suspension) {
            // Draw large "X" in number column
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.text('X', x + numWidth / 2, rowY, { align: 'center' });
            
            // Draw suspension info in goals column
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(5);
            // Display matchday range (e.g., "Sperre: ST 3-5" or "Sperre: ST 3" if only one matchday)
            const matchdayRange = suspension.start_matchday === suspension.end_matchday
                ? `ST ${suspension.start_matchday}`
                : `ST ${suspension.start_matchday}-${suspension.end_matchday}`;
            const suspensionLine1 = `Sperre: ${matchdayRange}`;
            // Shorten "Spieltag" to "ST" in reason text
            const reasonText = suspension.reason.replace(/Spieltag/gi, 'ST');
            const suspensionLine2 = `${reasonText}`;
            doc.text(suspensionLine1, x + numWidth + nameWidth + 1, rowY - 1.5);
            doc.text(suspensionLine2, x + numWidth + nameWidth + 1, rowY + 0.5);
            doc.setFontSize(8);
        }

        if (player.is_vlv_player) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(4);
            doc.text('VFV', x + numWidth + nameWidth - 1, rowBottom - 0.8, { align: 'right' });
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
        }
    });
}

function drawCardTable(doc, x, y, width, height) {
    const columns = [12, 14, 14, 14, width - 54];
    doc.rect(x, y, width, height);

    let cursor = x;
    columns.forEach((col) => {
        cursor += col;
        doc.line(cursor, y, cursor, y + height);
    });

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('Nummer', x + 1.5, y + 4);
    doc.text('Gelb', x + 13.5, y + 4);
    doc.text('Gelb-Rot', x + 28.5, y + 4);
    doc.text('Rot', x + 43.5, y + 4);
    doc.text('Name', x + 58, y + 4);
    doc.setFont('helvetica', 'normal');
    doc.text('Minute', x + 13.5, y + 7.5);
    doc.text('Minute', x + 28.5, y + 7.5);
    doc.text('Minute', x + 43.5, y + 7.5);
    doc.line(x, y + 8.5, x + width, y + 8.5);
}

function fillCardTable(doc, x, y, width, height, cards, teamId, players) {
    const playerMap = new Map((Array.isArray(players) ? players : []).map((player) => [player.id, player]));
    const teamCards = (Array.isArray(cards) ? cards : [])
        .filter((card) => card.team_id === teamId)
        .slice(0, 6);
    const rowHeight = teamCards.length > 0
        ? (height - 8.5) / 6
        : 0;
    const cardColumns = {
        yellow: x + 19,
        yellowRed: x + 33,
        red: x + 47,
    };

    doc.setFontSize(Math.max(5, Math.min(6, rowHeight * 1.6)));
    teamCards.forEach((card, index) => {
        const rowY = y + 8.5 + rowHeight * index + rowHeight * 0.65;
        const player = playerMap.get(card.player_id);
        const playerName = player ? `${player.last_name || ''} ${player.first_name || ''}`.trim() : '';
        const cardType = String(card.card_type || '').toLowerCase().replace(/[-_ ]/g, '');
        const minuteValue = card.minute === null || card.minute === undefined || String(card.minute).trim() === ''
            ? 'X'
            : String(card.minute);

        if (cardType === 'yellow' || cardType === 'gelb') {
            doc.text(minuteValue, cardColumns.yellow, rowY, { align: 'center' });
        } else if (cardType === 'yellowred' || cardType === 'gelbrot' || cardType === 'secondyellow') {
            doc.text(minuteValue, cardColumns.yellowRed, rowY, { align: 'center' });
        } else if (cardType === 'red' || cardType === 'rot') {
            doc.text(minuteValue, cardColumns.red, rowY, { align: 'center' });
        }

        doc.text(playerName, x + 58, rowY);
    });
}


import { applySeasonFixes } from './season-2026-fixes.js'; // TODO: Remove after 2026 season

const { jsPDF } = window.jspdf || {};
if (!jsPDF) {
    console.error('jsPDF library not loaded');
}

const seasonName = document.body?.dataset?.seasonName || '';

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

    // Get current match date and matchday
    const currentMatchDate = data.match?.match_date || data.match_date;
    const currentMatchday = data.match?.matchday;
    if (!currentMatchDate) {
        return suspendedPlayers;
    }
    
    const currentDate = new Date(currentMatchDate);
    
    // Process each suspension
    for (const suspension of data.suspensions) {
        // Skip if suspension is not active or missing data
        if (!suspension.is_active || !suspension.team_id || !suspension.player_id) {
            continue;
        }
        
        // Check if suspension is still active based on matches served
        const matchesRemaining = (suspension.matches_suspended || 0) - (suspension.matches_served || 0);
        if (matchesRemaining <= 0) {
            continue;
        }
        
        const createdAt = new Date(suspension.created_at);
        const teamId = suspension.team_id;
        
        // Find the matchday when suspension was created
        // This is the last matchday before or on the suspension creation date
        let suspensionMatchday = 0;
        for (const match of data.all_matches) {
            if (!match.matchday) continue;
            const matchDate = new Date(match.match_date);
            if (matchDate <= createdAt && 
                (match.home_team_id === teamId || match.away_team_id === teamId)) {
                suspensionMatchday = Math.max(suspensionMatchday, match.matchday);
            }
        }
        
        // Find all league matches (matchday != null) for this team after the suspension matchday
        // Sort by matchday number (not by date!) to handle postponed matches correctly
        const teamMatches = data.all_matches
            .filter(match => {
                // Only league matches (matchday exists)
                if (!match.matchday) return false;
                
                // Match involves this team
                const isTeamMatch = match.home_team_id === teamId || match.away_team_id === teamId;
                if (!isTeamMatch) return false;
                
                // Match is after suspension matchday
                return match.matchday > suspensionMatchday;
            })
            .sort((a, b) => a.matchday - b.matchday);
        
        // Find which suspended match number this current match is
        // For league matches: match by matchday
        // For manual mode (Cup/Test/Ersatz): no matchday, so won't match
        let currentMatchIndex = -1;
        if (currentMatchday) {
            currentMatchIndex = teamMatches.findIndex(match => 
                match.matchday === currentMatchday &&
                (match.home_team_id === teamId || match.away_team_id === teamId)
            );
        }
        
        // If current match is found and within suspension period
        if (currentMatchIndex !== -1) {
            const matchNumber = currentMatchIndex + 1; // 1-based
            const startMatch = (suspension.matches_served || 0) + 1;
            const endMatch = suspension.matches_suspended || 0;
            
            // Player is suspended if this match falls within the suspension range
            if (matchNumber >= startMatch && matchNumber <= endMatch) {
                suspendedPlayers.set(suspension.player_id, {
                    reason: suspension.reason || 'Keine Angabe',
                    matches_suspended: suspension.matches_suspended || 0,
                    matches_remaining: matchesRemaining,
                    current_match_number: matchNumber,
                });
            }
        }
    }
    
    return suspendedPlayers;
}

export function buildPdf(data, seasonLabel, matchType = null) {
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
    const seasonId = data.match?.season_id || '';
    
    // Apply season-specific fixes (e.g., FC Viktorsberg 2026 name swap)
    const homePlayersRaw = Array.isArray(data.players?.home) ? data.players.home : [];
    const awayPlayersRaw = Array.isArray(data.players?.away) ? data.players.away : [];
    const homePlayersFixed = applySeasonFixes(homePlayersRaw, data.teams?.home?.id || '', seasonId);
    const awayPlayersFixed = applySeasonFixes(awayPlayersRaw, data.teams?.away?.id || '', seasonId);
    
    const homePlayers = sortPlayers(homePlayersFixed);
    const awayPlayers = sortPlayers(awayPlayersFixed);

    // Calculate suspended players (experimental feature)
    const suspendedPlayers = calculateSuspendedPlayers(data);

    renderPage(doc, data, seasonLabel, homePlayers, awayPlayers, rows, matchType, suspendedPlayers);

    return doc;
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

function renderPage(doc, data, seasonLabel, homePlayers, awayPlayers, rows, matchType = null, suspendedPlayers = null) {
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
    doc.text('https://tschuta.at/tools/sbg/', pageWidth - margin, y, { align: 'right' });

    y += 8;
    drawLabelLine(doc, margin, y, 'Datum', 30, ':');
    drawLabelLine(doc, 60, y, 'Beginn', 20, ':');
    drawLabelLineCenteredColon(doc, 95, y, 'Halbzeit', 20);
    drawLabelLineCenteredColon(doc, 135, y, 'Endstand', 25);

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

    fillPlayers(doc, leftX, tableTop, tableWidth, headerHeight, rowHeight, rows, homePlayers, suspendedPlayers);
    fillPlayers(doc, rightX, tableTop, tableWidth, headerHeight, rowHeight, rows, awayPlayers, suspendedPlayers);

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

    doc.setFontSize(8);
    doc.text('Gebühr erhalten: 80,- EUR', leftX, footerY);
    doc.setFontSize(6);
    doc.text('Unterschrift Schiedsrichter', rightX, footerY);
    doc.line(rightX, footerY + 1.5, rightX + tableWidth, footerY + 1.5);

    fillHeaderValues(doc, data, seasonLabel);
}

function fillHeaderValues(doc, data) {
    const match = data.match || {};
    const teams = data.teams || {};
    const dateInfo = formatMatchDate(match.match_date || '');

    doc.setFontSize(9);
    doc.text(dateInfo.date || '', 28, 20.2);
    doc.text(dateInfo.time || '', 78, 20.2);
    doc.text(teams.home?.name || '', 24, 30.2);
    doc.text(teams.away?.name || '', 125, 30.2);
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

function fillPlayers(doc, x, y, width, headerHeight, rowHeight, rows, players, suspendedPlayers = null) {
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
            const suspensionLine1 = `Gesperrt: Spiel ${suspension.current_match_number}/${suspension.matches_suspended}`;
            const suspensionLine2 = `${suspension.reason}`;
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


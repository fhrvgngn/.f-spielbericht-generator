(() => {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
        return;
    }

    const seasonName = document.body?.dataset?.seasonName || '';

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
                const response = await fetch(`api.php?match_id=${encodeURIComponent(matchId)}`);
                const payload = await response.json();

                if (!response.ok) {
                    throw new Error(payload.error || 'Unbekannter Fehler');
                }

                const pdf = buildPdf(payload, seasonName);
                const filename = buildFilename(payload);
                pdf.save(filename);
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


    function buildPdf(data, seasonLabel) {
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
        const homePlayers = sortPlayers(Array.isArray(data.players?.home) ? data.players.home : []);
        const awayPlayers = sortPlayers(Array.isArray(data.players?.away) ? data.players.away : []);

        renderPage(doc, data, seasonLabel, homePlayers, awayPlayers, rows);

        return doc;
    }

    function sortPlayers(players) {
        return [...players].sort((a, b) => {
            const aHasNumber = a.jersey_number != null && a.jersey_number !== '';
            const bHasNumber = b.jersey_number != null && b.jersey_number !== '';
            
            // Both have numbers - sort numerically
            if (aHasNumber && bHasNumber) {
                return Number(a.jersey_number) - Number(b.jersey_number);
            }
            
            // One has number, one doesn't - number comes first
            if (aHasNumber && !bHasNumber) return -1;
            if (!aHasNumber && bHasNumber) return 1;
            
            // Neither has number - sort by last name alphabetically
            const aName = (a.last_name || '').toLowerCase();
            const bName = (b.last_name || '').toLowerCase();
            return aName.localeCompare(bName);
        });
    }

    function buildFilename(data) {
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

    function renderPage(doc, data, seasonLabel, homePlayers, awayPlayers, rows) {
        const pageWidth = 210;
        const pageHeight = 297;
        const margin = 12;
        let y = 12;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(`SPIELBERICHT - HOBBYLIGA VORDERLAND ${seasonLabel}`, margin, y);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text('hobbyliga-vorderland.at', pageWidth - margin, y, { align: 'right' });

        doc.setFontSize(4.5);
        doc.text('©2026 Reinhard Lins .fahrvergnuegen', pageWidth - 5, pageHeight - 15, {
            angle: 90,
            align: 'left',
        });

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

        fillPlayers(doc, leftX, tableTop, tableWidth, headerHeight, rowHeight, rows, homePlayers);
        fillPlayers(doc, rightX, tableTop, tableWidth, headerHeight, rowHeight, rows, awayPlayers);

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

    function drawPlayerTable(doc, x, y, width, headerHeight, rowHeight, rows, c1, c2, c3) {
        doc.rect(x, y, width, headerHeight + rowHeight * rows);
        doc.line(x, y + headerHeight, x + width, y + headerHeight);

        const numWidth = 16;
        const goalsWidth = 26;
        const nameWidth = width - numWidth - goalsWidth;

        doc.line(x + numWidth, y, x + numWidth, y + headerHeight + rowHeight * rows);
        doc.line(x + numWidth + nameWidth, y, x + numWidth + nameWidth, y + headerHeight + rowHeight * rows);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(c1, x + 2, y + 4);
        doc.text(c2, x + numWidth + 2, y + 4);
        doc.text('TORE', x + numWidth + nameWidth + 2, y + 4);
        doc.setFont('helvetica', 'normal');
        doc.text('Minute', x + numWidth + nameWidth + 14, y + 4);

        for (let i = 1; i <= rows; i += 1) {
            const rowY = y + headerHeight + i * rowHeight;
            doc.line(x, rowY, x + width, rowY);
        }
    }

    function fillPlayers(doc, x, y, width, headerHeight, rowHeight, rows, players) {
        const numWidth = 16;
        const nameWidth = width - numWidth - 26;
        doc.setFontSize(8);

        const safePlayers = Array.isArray(players) ? players : [];
        const visible = safePlayers.slice(0, rows);

        visible.forEach((player, index) => {
            const rowY = y + headerHeight + rowHeight * index + rowHeight * 0.7;
            const rowBottom = y + headerHeight + rowHeight * (index + 1);
            const number = player.jersey_number ?? '';
            const name = `${player.last_name || ''} ${player.first_name || ''}`.trim();

            doc.text(String(number || ''), x + 2, rowY);
            doc.text(name, x + numWidth + 2, rowY);

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
})();

<?php

declare(strict_types=1);

function simple_pdf_from_lines(array $lines): string
{
    $pageWidth = 595.28;
    $pageHeight = 841.89;
    $marginLeft = 50.0;
    $marginTop = 50.0;
    $marginBottom = 50.0;
    $fontSize = 12.0;
    $leading = 14.0;

    $maxLines = (int) floor(($pageHeight - $marginTop - $marginBottom) / $leading);
    $maxLines = max(1, $maxLines);

    $pages = array_chunk($lines, $maxLines);

    $objects = [];
    $objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    $objects[2] = '__PAGES__';
    $objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

    $pageKids = [];
    $objId = 3;

    foreach ($pages as $pageLines) {
        $pageObjId = ++$objId;
        $contentObjId = ++$objId;

        $pageKids[] = $pageObjId . ' 0 R';

        $contentStream = build_content_stream(
            $pageLines,
            $marginLeft,
            $pageHeight - $marginTop,
            $fontSize,
            $leading
        );

        $objects[$pageObjId] = "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 3 0 R >> >> /MediaBox [0 0 $pageWidth $pageHeight] /Contents $contentObjId 0 R >>";
        $objects[$contentObjId] = "<< /Length " . strlen($contentStream) . " >>\nstream\n" . $contentStream . "\nendstream";
    }

    $objects[2] = "<< /Type /Pages /Kids [" . implode(' ', $pageKids) . "] /Count " . count($pageKids) . " >>";

    ksort($objects);

    $pdf = "%PDF-1.4\n";
    $offsets = [0];

    foreach ($objects as $id => $content) {
        $offsets[$id] = strlen($pdf);
        $pdf .= $id . " 0 obj\n" . $content . "\nendobj\n";
    }

    $xref = strlen($pdf);
    $count = count($objects) + 1;

    $pdf .= "xref\n0 $count\n";
    $pdf .= "0000000000 65535 f \n";

    for ($i = 1; $i < $count; $i++) {
        $pdf .= sprintf("%010d 00000 n \n", $offsets[$i]);
    }

    $pdf .= "trailer\n<< /Size $count /Root 1 0 R >>\nstartxref\n$xref\n%%EOF";

    return $pdf;
}

function build_content_stream(array $lines, float $x, float $y, float $fontSize, float $leading): string
{
    $stream = "BT\n";
    $stream .= "/F1 $fontSize Tf\n";
    $stream .= "$leading TL\n";
    $stream .= sprintf("%.2f %.2f Td\n", $x, $y);

    $lineCount = count($lines);
    foreach ($lines as $index => $line) {
        $encoded = pdf_encode_text($line);
        $stream .= "(" . $encoded . ") Tj\n";
        if ($index < $lineCount - 1) {
            $stream .= "T*\n";
        }
    }

    $stream .= "ET";

    return $stream;
}

function pdf_encode_text(string $text): string
{
    $converted = iconv('UTF-8', 'ISO-8859-1//TRANSLIT', $text);
    if ($converted === false) {
        $converted = $text;
    }

    return pdf_escape_text($converted);
}

function pdf_escape_text(string $text): string
{
    return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $text);
}

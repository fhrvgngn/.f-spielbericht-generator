<?php

declare(strict_types=1);

date_default_timezone_set('Europe/Vienna');
header('Content-Type: application/json');

$raw = file_get_contents('php://input');
$event = json_decode($raw, true);

if (!is_array($event)) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid payload']);
    exit;
}

$event['received_at'] = date('c');
$line = json_encode($event, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL;

$logDir = __DIR__ . '/logs';
$logFile = $logDir . '/telemetry.log';

// Ensure logs directory exists (user will create it, but add safety check)
if (!is_dir($logDir)) {
    http_response_code(500);
    echo json_encode(['error' => 'logs directory not found']);
    exit;
}

$fp = @fopen($logFile, 'ab');
if ($fp) {
    flock($fp, LOCK_EX);
    fwrite($fp, $line);
    flock($fp, LOCK_UN);
    fclose($fp);
    echo json_encode(['ok' => true]);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'failed to write log']);
}

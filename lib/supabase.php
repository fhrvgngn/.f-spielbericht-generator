<?php

declare(strict_types=1);

require_once __DIR__ . '/../config.php';

function supabase_get(string $path, array $query = []): array
{
    $base = rtrim(SUPABASE_URL, '/');
    $url = $base . '/' . ltrim($path, '/');

    if (!empty($query)) {
        $url .= '?' . http_build_query($query);
    }

    if (isset($_SESSION['supabase_cache'][$url]) && is_array($_SESSION['supabase_cache'][$url])) {
        $cached = $_SESSION['supabase_cache'][$url];
        $cachedAt = $cached['cached_at'] ?? 0;
        if (is_int($cachedAt) && (time() - $cachedAt) <= 300) {
            $cachedData = $cached['data'] ?? null;
            if (is_array($cachedData)) {
                return $cachedData;
            }
        }
    }

    $ch = curl_init($url);
    
    // Detect local development environment
    $isLocalDev = in_array($_SERVER['SERVER_NAME'] ?? '', ['localhost', '127.0.0.1', '::1']) 
                  || php_sapi_name() === 'cli-server';
    
    $curlOptions = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . SUPABASE_TOKEN,
            'apikey: ' . SUPABASE_APIKEY,
            'Accept: application/json',
        ],
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 30,
    ];
    
    // Disable SSL verification for local development
    if ($isLocalDev) {
        $curlOptions[CURLOPT_SSL_VERIFYPEER] = false;
        $curlOptions[CURLOPT_SSL_VERIFYHOST] = false;
    }
    
    curl_setopt_array($ch, $curlOptions);

    $body = curl_exec($ch);
    if ($body === false) {
        $error = curl_error($ch);
        throw new RuntimeException('Supabase request failed: ' . $error);
    }

    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);

    if ($status >= 400) {
        throw new RuntimeException('Supabase HTTP ' . $status . ': ' . $body);
    }

    $data = json_decode($body, true);
    if (!is_array($data)) {
        return [];
    }

    $_SESSION['supabase_cache'][$url] = [
        'cached_at' => time(),
        'data' => $data,
    ];

    return $data;
}

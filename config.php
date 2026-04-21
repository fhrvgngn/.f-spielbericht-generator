<?php

declare(strict_types=1);

date_default_timezone_set('Europe/Vienna');

if (session_status() !== PHP_SESSION_ACTIVE) {
	session_start();
}

const SUPABASE_URL = 'https://fpiylhqnexlnlxketmzk.supabase.co/rest/v1';
const SUPABASE_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwaXlsaHFuZXhsbmx4a2V0bXprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMzA5ODQsImV4cCI6MjA4NzYwNjk4NH0.wkCwjtv4yxpmC31DX0AJibGHj1SRALOQaDfrW6RU_pE';
const SUPABASE_APIKEY = SUPABASE_TOKEN;

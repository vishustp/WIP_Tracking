$key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds"
$headers = @{
    "apikey" = $key
    "Authorization" = "Bearer $key"
    "Range" = "0-0"
    "Prefer" = "count=exact"
}
$base = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1"

$res = Invoke-WebRequest -Uri "$base/production_logs" -Headers $headers
Write-Host "Total rows in production_logs: $($res.Headers['Content-Range'])"

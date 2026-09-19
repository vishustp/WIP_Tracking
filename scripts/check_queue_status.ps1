$key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds"
$headers = @{
    "apikey" = $key
    "Authorization" = "Bearer $key"
    "Content-Type" = "application/json"
}
$base = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1"

$q = Invoke-RestMethod -Uri "$base/rpc/get_production_entry_queue" -Method Post -Headers $headers -Body '{"p_stage_code":"ROLLING"}'

$checkWos = @("6336", "6215", "5887", "5886", "6261")
foreach ($w in $checkWos) {
    $item = $q | Where-Object { $_.work_order_no -eq $w }
    if ($item) {
        Write-Host "WO $w is in Rolling Queue with balance_to_make: $($item.balance_to_make)"
    } else {
        Write-Host "WO $w is NOT in Rolling Queue (Balance = 0 / fully rolled)."
    }
}

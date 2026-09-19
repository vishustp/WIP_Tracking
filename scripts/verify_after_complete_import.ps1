$key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds"
$headers = @{
    "apikey" = $key
    "Authorization" = "Bearer $key"
    "Content-Type" = "application/json"
}
$base = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1"

Write-Host "=== WO 6336 LOGS IN DB ==="
$wo = Invoke-RestMethod -Uri "$base/work_orders?work_order_no=eq.6336&select=id" -Headers $headers
$woId = $wo[0].id
$logs = Invoke-RestMethod -Uri "$base/production_logs?work_order_id=eq.$woId&select=*" -Headers $headers
Write-Host "WO 6336 now has $($logs.Count) logs recorded!"
$totalMtr = ($logs | Measure-Object -Property output_qty -Sum).Sum
Write-Host "Total Mtr Logged for 6336: $totalMtr Mtr"

Write-Host "`n=== ROLLING QUEUE FOR 6336 ==="
$q = Invoke-RestMethod -Uri "$base/rpc/get_production_entry_queue" -Method Post -Headers $headers -Body '{"p_stage_code":"ROLLING"}'
$q6336 = $q | Where-Object { $_.work_order_no -eq "6336" }
if ($q6336) {
    Write-Host "6336 Queue balance_to_make: $($q6336.balance_to_make)"
} else {
    Write-Host "6336 is fully rolled and no longer in the Rolling Queue!"
}

Write-Host "`n=== CHECK OTHER TARGET WOS ==="
$targetWos = @("6215", "5887", "5886", "6261", "6191", "6248", "6237", "6247", "5747")
foreach ($w in $targetWos) {
    $woItem = Invoke-RestMethod -Uri "$base/work_orders?work_order_no=eq.$w&select=id" -Headers $headers
    if ($woItem) {
        $wId = $woItem[0].id
        $wLogs = Invoke-RestMethod -Uri "$base/production_logs?work_order_id=eq.$wId&select=id" -Headers $headers
        Write-Host "WO $w : $($wLogs.Count) logs"
    }
}

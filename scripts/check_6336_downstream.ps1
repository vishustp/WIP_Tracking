$key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds"
$headers = @{
    "apikey" = $key
    "Authorization" = "Bearer $key"
}

# Check downstream stages for 6336
$base = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1"
$wo = Invoke-RestMethod -Uri "$base/work_orders?work_order_no=eq.6336&select=id,customer_name,status" -Headers $headers
$wo | ConvertTo-Json

$logs = Invoke-RestMethod -Uri "$base/production_logs?work_order_id=eq.$($wo[0].id)&select=process_date,output_qty,htc_ok,remarks" -Headers $headers
Write-Host "Total logs for 6336 in DB: $($logs.Count)"
Write-Host "Sample remarks with pieces:"
$logs | Select-Object -First 5 | Format-Table -AutoSize

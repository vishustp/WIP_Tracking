$key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds"
$headers = @{
    "apikey" = $key
    "Authorization" = "Bearer $key"
    "Content-Type" = "application/json"
}
$base = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1"

$q = Invoke-RestMethod -Uri "$base/rpc/get_production_entry_queue" -Method Post -Headers $headers -Body '{"p_stage_code":"ROLLING"}'
$item = $q | Where-Object { $_.work_order_no -eq "6336" }
$item | ConvertTo-Json -Depth 5

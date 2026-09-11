Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$excelPath = 'C:\Users\Kallol Bera\Downloads\DB & HT Report.xlsx'
$outputDir = 'C:\Users\Kallol Bera\Downloads\Backups\Tracking\WIP_Tracking\sql_imports'

if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

Write-Host "Opening Excel file: $excelPath"
$fileStream = [System.IO.File]::Open($excelPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
$zip = New-Object System.IO.Compression.ZipArchive($fileStream, [System.IO.Compression.ZipArchiveMode]::Read)

$sharedStringsEntry = $zip.Entries | Where-Object { $_.FullName -eq 'xl/sharedStrings.xml' }
$reader = New-Object System.IO.StreamReader($sharedStringsEntry.Open())
$xml = [xml]$reader.ReadToEnd()
$reader.Close()
$sharedStrings = @($xml.sst.si | ForEach-Object { 
    if ($_.t) { $_.t } 
    elseif ($_.r) { ($_.r | ForEach-Object { $_.t }) -join '' } 
    else { '' } 
})

function Escape-Sql($str) {
    if ($null -eq $str) { return "NULL" }
    $s = [string]$str
    $s = $s.Replace("'", "''").Trim()
    if ($s -eq "") { return "NULL" }
    return "'$s'"
}

function Generate-SqlChunk($fileName, $title, $sheetPath, $stageCode, $config, $monthFilter = $null) {
    $filePath = Join-Path $outputDir $fileName
    $sqlWriter = New-Object System.IO.StreamWriter($filePath, $false, [System.Text.Encoding]::UTF8)
    
    $sqlWriter.WriteLine("-- =============================================================================")
    $sqlWriter.WriteLine("-- $title")
    $sqlWriter.WriteLine("-- Generated on: " + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss"))
    $sqlWriter.WriteLine("-- =============================================================================")
    $sqlWriter.WriteLine("")
    $sqlWriter.WriteLine("BEGIN;")
    $sqlWriter.WriteLine("")
    $sqlWriter.WriteLine("CREATE TEMP TABLE temp_prod_import (")
    $sqlWriter.WriteLine("  work_order_no text,")
    $sqlWriter.WriteLine("  stage_code text,")
    $sqlWriter.WriteLine("  process_date date,")
    $sqlWriter.WriteLine("  input_qty numeric,")
    $sqlWriter.WriteLine("  output_qty numeric,")
    $sqlWriter.WriteLine("  rejection_qty numeric,")
    $sqlWriter.WriteLine("  pcs integer,")
    $sqlWriter.WriteLine("  rej_pcs integer,")
    $sqlWriter.WriteLine("  heat_lot_no text,")
    $sqlWriter.WriteLine("  shift text,")
    $sqlWriter.WriteLine("  machine_no text,")
    $sqlWriter.WriteLine("  remarks text")
    $sqlWriter.WriteLine(") ON COMMIT DROP;")
    $sqlWriter.WriteLine("")
    
    $sheetEntry = $zip.Entries | Where-Object { $_.FullName -eq $sheetPath }
    $reader = New-Object System.IO.StreamReader($sheetEntry.Open())
    $sXml = [xml]$reader.ReadToEnd()
    $reader.Close()
    
    $rows = $sXml.worksheet.sheetData.row
    $batch = @()
    $insertedCount = 0
    
    for ($i = 1; $i -lt $rows.Count; $i++) {
        $row = $rows[$i]
        $vals = @{}
        
        foreach ($c in $row.c) {
            $colLetter = $c.r -replace '\d+',''
            $val = $c.v
            if ($c.t -eq 's' -and $val -ne $null) { $val = $sharedStrings[[int]$val] }
            $vals[$colLetter] = $val
        }
        
        # Month filtering if specified
        if ($monthFilter) {
            $rowMonth = $vals["B"]
            if (-not $rowMonth -or -not ($monthFilter -contains $rowMonth.ToString().Trim())) {
                continue
            }
        }
        
        $wo = $vals[$config.WoCol]
        if (-not $wo -and $config.AltWoCol) { $wo = $vals[$config.AltWoCol] }
        if (-not $wo) { continue }
        $wo = ([string]$wo).Trim()
        if ($wo -eq "" -or $wo -match "^Total" -or $wo -match "^W\.O") { continue }
        
        $dateStr = "CURRENT_DATE"
        if ($vals[$config.DateCol] -as [double]) {
            $oaDate = [double]$vals[$config.DateCol]
            if ($oaDate -gt 30000 -and $oaDate -lt 60000) {
                $dateStr = "'" + [DateTime]::FromOADate($oaDate).ToString("yyyy-MM-dd") + "'::date"
            }
        }
        
        $outMtr = 0.0
        if ($vals[$config.OutMtrCol] -as [double]) { $outMtr = [double]$vals[$config.OutMtrCol] }
        
        $outPcs = 0
        if ($vals[$config.OutPcsCol] -as [double]) { $outPcs = [Math]::Round([double]$vals[$config.OutPcsCol]) }
        
        $rejPcs = 0
        if ($vals[$config.RejPcsCol] -as [double]) { $rejPcs = [Math]::Round([double]$vals[$config.RejPcsCol]) }
        
        $rejMtr = 0.0
        if ($config.RejMtrCol -and ($vals[$config.RejMtrCol] -as [double])) {
            $rejMtr = [double]$vals[$config.RejMtrCol]
        } elseif ($rejPcs -gt 0 -and $outPcs -gt 0 -and $outMtr -gt 0) {
            $rejMtr = [Math]::Round(($outMtr / $outPcs) * $rejPcs, 2)
        }
        
        $inMtr = $outMtr + $rejMtr
        if ($inMtr -le 0 -and $outPcs -le 0) { continue }
        
        $heatNo = Escape-Sql $vals[$config.HeatCol]
        $shift = Escape-Sql $vals[$config.ShiftCol]
        $machine = Escape-Sql $vals[$config.MachineCol]
        
        $rem = ""
        if ($vals[$config.StageSubCol]) { $rem += "Stage: " + $vals[$config.StageSubCol] + " " }
        if ($vals[$config.MachineCol]) { $rem += "Machine: " + $vals[$config.MachineCol] + " " }
        if ($vals[$config.ShiftCol]) { $rem += "Shift: " + $vals[$config.ShiftCol] }
        $remarksSql = Escape-Sql $rem.Trim()
        
        $woSql = Escape-Sql $wo
        $batch += "($woSql, '$stageCode', $dateStr, $inMtr, $outMtr, $rejMtr, $outPcs, $rejPcs, $heatNo, $shift, $machine, $remarksSql)"
        $insertedCount++
        
        if ($batch.Count -ge 500) {
            $sqlWriter.WriteLine("INSERT INTO temp_prod_import (work_order_no, stage_code, process_date, input_qty, output_qty, rejection_qty, pcs, rej_pcs, heat_lot_no, shift, machine_no, remarks) VALUES")
            $sqlWriter.WriteLine(($batch -join ",`n") + ";")
            $sqlWriter.WriteLine("")
            $batch = @()
        }
    }
    
    if ($batch.Count -gt 0) {
        $sqlWriter.WriteLine("INSERT INTO temp_prod_import (work_order_no, stage_code, process_date, input_qty, output_qty, rejection_qty, pcs, rej_pcs, heat_lot_no, shift, machine_no, remarks) VALUES")
        $sqlWriter.WriteLine(($batch -join ",`n") + ";")
        $sqlWriter.WriteLine("")
    }
    
    $sqlWriter.WriteLine("-- Insert matched records into production_logs")
    $sqlWriter.WriteLine("INSERT INTO public.production_logs (")
    $sqlWriter.WriteLine("  work_order_id,")
    $sqlWriter.WriteLine("  stage_id,")
    $sqlWriter.WriteLine("  process_route_id,")
    $sqlWriter.WriteLine("  process_date,")
    $sqlWriter.WriteLine("  input_qty,")
    $sqlWriter.WriteLine("  output_qty,")
    $sqlWriter.WriteLine("  rejection_qty,")
    $sqlWriter.WriteLine("  htc_ok,")
    $sqlWriter.WriteLine("  heat_lot_no,")
    $sqlWriter.WriteLine("  remarks")
    $sqlWriter.WriteLine(")")
    $sqlWriter.WriteLine("SELECT")
    $sqlWriter.WriteLine("  wo.id AS work_order_id,")
    $sqlWriter.WriteLine("  ps.id AS stage_id,")
    $sqlWriter.WriteLine("  COALESCE(")
    $sqlWriter.WriteLine("    (SELECT rp.process_route_id FROM public.rolling_plans rp WHERE rp.work_order_id = wo.id ORDER BY rp.created_at DESC LIMIT 1),")
    $sqlWriter.WriteLine("    (SELECT pr.id FROM public.process_routes pr WHERE pr.route_code = 'CDS' LIMIT 1)")
    $sqlWriter.WriteLine("  ) AS process_route_id,")
    $sqlWriter.WriteLine("  t.process_date,")
    $sqlWriter.WriteLine("  t.input_qty,")
    $sqlWriter.WriteLine("  t.output_qty,")
    $sqlWriter.WriteLine("  t.rejection_qty,")
    $sqlWriter.WriteLine("  0 AS htc_ok,")
    $sqlWriter.WriteLine("  t.heat_lot_no,")
    $sqlWriter.WriteLine("  TRIM(COALESCE(t.remarks, '') || ' [PCS:' || t.pcs || '] [REJ_PCS:' || t.rej_pcs || ']') AS remarks")
    $sqlWriter.WriteLine("FROM temp_prod_import t")
    $sqlWriter.WriteLine("JOIN public.work_orders wo ON (")
    $sqlWriter.WriteLine("  UPPER(TRIM(wo.work_order_no)) = UPPER(TRIM(t.work_order_no))")
    $sqlWriter.WriteLine("  OR UPPER(TRIM(wo.work_order_no)) = UPPER('DOM-' || LPAD(TRIM(t.work_order_no), 5, '0'))")
    $sqlWriter.WriteLine("  OR UPPER(TRIM(REPLACE(wo.work_order_no, 'DOM-', ''))) = UPPER(TRIM(REPLACE(t.work_order_no, 'DOM-', '')))")
    $sqlWriter.WriteLine(")")
    $sqlWriter.WriteLine("JOIN public.process_stages ps ON ps.stage_code = t.stage_code;")
    $sqlWriter.WriteLine("")
    $sqlWriter.WriteLine("DO `$body`$")
    $sqlWriter.WriteLine("DECLARE")
    $sqlWriter.WriteLine("  r RECORD;")
    $sqlWriter.WriteLine("BEGIN")
    $sqlWriter.WriteLine("  FOR r IN")
    $sqlWriter.WriteLine("    SELECT DISTINCT wo.id")
    $sqlWriter.WriteLine("    FROM temp_prod_import t")
    $sqlWriter.WriteLine("    JOIN public.work_orders wo ON (")
    $sqlWriter.WriteLine("      UPPER(TRIM(wo.work_order_no)) = UPPER(TRIM(t.work_order_no))")
    $sqlWriter.WriteLine("      OR UPPER(TRIM(wo.work_order_no)) = UPPER('DOM-' || LPAD(TRIM(t.work_order_no), 5, '0'))")
    $sqlWriter.WriteLine("      OR UPPER(TRIM(REPLACE(wo.work_order_no, 'DOM-', ''))) = UPPER(TRIM(REPLACE(t.work_order_no, 'DOM-', '')))")
    $sqlWriter.WriteLine("    )")
    $sqlWriter.WriteLine("  LOOP")
    $sqlWriter.WriteLine("    PERFORM public.recalculate_work_order_wip(r.id);")
    $sqlWriter.WriteLine("  END LOOP;")
    $sqlWriter.WriteLine("END `$body`$;")
    $sqlWriter.WriteLine("")
    $sqlWriter.WriteLine("COMMIT;")
    
    $sqlWriter.Close()
    $sqlWriter.Dispose()
    
    Write-Host "Created ${fileName} with $insertedCount rows."
}

$dbConfig = @{
    WoCol = "G"; AltWoCol = "F"; DateCol = "A"; ShiftCol = "C"; MachineCol = "E";
    HeatCol = "J"; StageSubCol = "O"; OutPcsCol = "U"; OutMtrCol = "V"; RejPcsCol = "Z"; RejMtrCol = "AA"
}

$htConfig = @{
    WoCol = "G"; AltWoCol = "F"; DateCol = "A"; ShiftCol = "C"; MachineCol = "D";
    HeatCol = "K"; StageSubCol = "L"; OutPcsCol = "R"; OutMtrCol = "S"; RejPcsCol = "Z"; RejMtrCol = $null
}

# 1. Draw Bench Part 1 (Jan - Apr)
Generate-SqlChunk "01_db_jan_to_apr.sql" "Draw Bench Import (Jan to Apr 2026)" "xl/worksheets/sheet1.xml" "DRAW" $dbConfig @("Jan-26","Feb-26","Mar-26","Apr-26")

# 2. Draw Bench Part 2 (May - Sep)
Generate-SqlChunk "02_db_may_to_sep.sql" "Draw Bench Import (May to Sep 2026)" "xl/worksheets/sheet1.xml" "DRAW" $dbConfig @("May-26","Jun-26","Jul-26","Aug-26","Sep-26")

# 3. Heat Treatment Part 1 (Jan - Mar)
Generate-SqlChunk "03_ht_jan_to_mar.sql" "Heat Treatment Import (Jan to Mar 2026)" "xl/worksheets/sheet3.xml" "HEAT_TREATMENT" $htConfig @("Jan-26","Feb-26","Mar-26")

# 4. Heat Treatment Part 2 (Apr - Jun)
Generate-SqlChunk "04_ht_apr_to_jun.sql" "Heat Treatment Import (Apr to Jun 2026)" "xl/worksheets/sheet3.xml" "HEAT_TREATMENT" $htConfig @("Apr-26","May-26","Jun-26")

# 5. Heat Treatment Part 3 (Jul - Sep)
Generate-SqlChunk "05_ht_jul_to_sep.sql" "Heat Treatment Import (Jul to Sep 2026)" "xl/worksheets/sheet3.xml" "HEAT_TREATMENT" $htConfig @("Jul-26","Aug-26","Sep-26")

$zip.Dispose()
$fileStream.Close()
$fileStream.Dispose()

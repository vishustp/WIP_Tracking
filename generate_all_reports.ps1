Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$trackingDir = 'C:\Users\Kallol Bera\Downloads\Backups\Tracking'
$outputDir = 'C:\Users\Kallol Bera\Downloads\Backups\Tracking\WIP_Tracking'

function Escape-Sql($str) {
    if ($null -eq $str) { return 'NULL' }
    $s = [string]$str
    $s = $s.Replace("'", "''").Trim()
    if ($s -eq "") { return 'NULL' }
    return "'$s'"
}

$targetOa = [DateTime]::Parse('2026-09-01').ToOADate()

# =========================================================================
# 1. BUNDLING (FINISHING LINE)
# =========================================================================
$bundlingPath = Join-Path $trackingDir 'Bundling Report(6).xlsx'
$fileStream = [System.IO.File]::Open($bundlingPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
$zip = New-Object System.IO.Compression.ZipArchive($fileStream, [System.IO.Compression.ZipArchiveMode]::Read)

$sharedStrings = @()
$sharedStringsEntry = $zip.Entries | Where-Object { $_.FullName -eq 'xl/sharedStrings.xml' }
if ($sharedStringsEntry) {
    $reader = New-Object System.IO.StreamReader($sharedStringsEntry.Open())
    $xml = [xml]$reader.ReadToEnd()
    $reader.Close()
    $sharedStrings = @($xml.sst.si | ForEach-Object { if ($_.t) { $_.t } elseif ($_.r) { ($_.r | ForEach-Object { $_.t }) -join '' } else { '' } })
}

$sheetEntry = $zip.Entries | Where-Object { $_.FullName -eq 'xl/worksheets/sheet1.xml' }
$reader = New-Object System.IO.StreamReader($sheetEntry.Open())
$sXml = [xml]$reader.ReadToEnd()
$reader.Close()
$rows = $sXml.worksheet.sheetData.row

$bundlingSqlPath = Join-Path $outputDir 'import_bundling_from_sep_01_2026.sql'
$sqlWriter = New-Object System.IO.StreamWriter($bundlingSqlPath, $false, [System.Text.Encoding]::UTF8)

$sqlWriter.WriteLine("-- =============================================================================")
$sqlWriter.WriteLine("-- Finishing / Bundling Production Import (From 01-Sep-2026)")
$sqlWriter.WriteLine("-- Source: Bundling Report(6).xlsx")
$sqlWriter.WriteLine("-- =============================================================================")
$sqlWriter.WriteLine("BEGIN;")
$sqlWriter.WriteLine("")
$sqlWriter.WriteLine("CREATE TEMP TABLE temp_bundling_import (")
$sqlWriter.WriteLine("  work_order_no text,")
$sqlWriter.WriteLine("  process_date date,")
$sqlWriter.WriteLine("  pcs integer,")
$sqlWriter.WriteLine("  mtr numeric,")
$sqlWriter.WriteLine("  mt numeric,")
$sqlWriter.WriteLine("  heat_lot_no text,")
$sqlWriter.WriteLine("  bundle_no text,")
$sqlWriter.WriteLine("  work_center text,")
$sqlWriter.WriteLine("  shift text,")
$sqlWriter.WriteLine("  remarks text")
$sqlWriter.WriteLine(") ON COMMIT DROP;")
$sqlWriter.WriteLine("")

$batch = @()
$bCount = 0; $bTotPcs = 0; $bTotMtr = 0.0; $bTotMt = 0.0

for ($i = 1; $i -lt $rows.Count; $i++) {
    $vals = @{}
    foreach ($c in $rows[$i].c) {
        $col = $c.r -replace '\d+',''
        $val = $c.v
        if ($c.t -eq 's' -and $val -ne $null) { $val = $sharedStrings[[int]$val] }
        $vals[$col] = $val
    }
    $oa = 0.0
    if ($vals['A'] -as [double]) { $oa = [double]$vals['A'] }
    if ($oa -lt $targetOa) { continue }
    
    $wo = if ($vals['J']) { ($vals['J']).ToString().Trim() } else { if ($vals['I']) { ($vals['I']).ToString().Trim() } else { '' } }
    if (-not $wo -or $wo -match '^Total') { continue }
    
    $dateStr = "'" + [DateTime]::FromOADate($oa).ToString('yyyy-MM-dd') + "'::date"
    $pcs = if ($vals['X'] -as [double]) { [Math]::Round([double]$vals['X']) } else { 0 }
    $mtr = if ($vals['Y'] -as [double]) { [double]$vals['Y'] } else { 0.0 }
    $mt = if ($vals['Z'] -as [double]) { [double]$vals['Z'] } else { 0.0 }
    if ($pcs -le 0 -and $mtr -le 0) { continue }
    
    $heat = Escape-Sql $vals['R']
    $bNo = Escape-Sql $vals['U']
    $wc = Escape-Sql $vals['C']
    $shift = Escape-Sql $vals['F']
    $rem = Escape-Sql $vals['AB']
    $woSql = Escape-Sql $wo
    
    $batch += "($woSql, $dateStr, $pcs, $mtr, $mt, $heat, $bNo, $wc, $shift, $rem)"
    $bCount++; $bTotPcs += $pcs; $bTotMtr += $mtr; $bTotMt += $mt
}

if ($batch.Count -gt 0) {
    $sqlWriter.WriteLine("INSERT INTO temp_bundling_import (work_order_no, process_date, pcs, mtr, mt, heat_lot_no, bundle_no, work_center, shift, remarks) VALUES")
    $sqlWriter.WriteLine(($batch -join ",`n") + ";")
    $sqlWriter.WriteLine("")
}

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
$sqlWriter.WriteLine("  (SELECT id FROM public.process_stages WHERE stage_code = 'FINISHING' LIMIT 1) AS stage_id,")
$sqlWriter.WriteLine("  COALESCE(")
$sqlWriter.WriteLine("    (SELECT rp.process_route_id FROM public.rolling_plans rp WHERE rp.work_order_id = wo.id ORDER BY rp.created_at DESC LIMIT 1),")
$sqlWriter.WriteLine("    (SELECT pr.id FROM public.process_routes pr WHERE pr.route_code = 'CDS' LIMIT 1)")
$sqlWriter.WriteLine("  ) AS process_route_id,")
$sqlWriter.WriteLine("  t.process_date,")
$sqlWriter.WriteLine("  t.mtr AS input_qty,")
$sqlWriter.WriteLine("  t.mtr AS output_qty,")
$sqlWriter.WriteLine("  0 AS rejection_qty,")
$sqlWriter.WriteLine("  0 AS htc_ok,")
$sqlWriter.WriteLine("  t.heat_lot_no,")
$sqlWriter.WriteLine("  TRIM(COALESCE('Bundle: ' || t.bundle_no || ' Line: ' || t.work_center || ' Shift: ' || t.shift || ' ' || COALESCE(t.remarks, ''), '') || ' [PCS:' || t.pcs || '] [REJ_PCS:0]') AS remarks")
$sqlWriter.WriteLine("FROM temp_bundling_import t")
$sqlWriter.WriteLine("JOIN public.work_orders wo ON (")
$sqlWriter.WriteLine("  UPPER(TRIM(wo.work_order_no)) = UPPER(TRIM(t.work_order_no))")
$sqlWriter.WriteLine("  OR UPPER(TRIM(wo.work_order_no)) = UPPER('DOM-' || LPAD(TRIM(t.work_order_no), 5, '0'))")
$sqlWriter.WriteLine("  OR UPPER(TRIM(REPLACE(wo.work_order_no, 'DOM-', ''))) = UPPER(TRIM(REPLACE(t.work_order_no, 'DOM-', '')))")
$sqlWriter.WriteLine(");")
$sqlWriter.WriteLine("")
$sqlWriter.WriteLine("DO `$body`$")
$sqlWriter.WriteLine("DECLARE")
$sqlWriter.WriteLine("  r RECORD;")
$sqlWriter.WriteLine("BEGIN")
$sqlWriter.WriteLine("  FOR r IN")
$sqlWriter.WriteLine("    SELECT DISTINCT wo.id")
$sqlWriter.WriteLine("    FROM temp_bundling_import t")
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
$zip.Dispose()
$fileStream.Close()
$fileStream.Dispose()
Write-Host "Bundling Finishing: $bCount rows ($bTotPcs Pcs, $bTotMtr Mtr, $bTotMt MT)"

# =========================================================================
# 2. VDI (QC INSPECTION)
# =========================================================================
$vdiPath = Join-Path $trackingDir 'VDI Report.xlsx'
$fileStream = [System.IO.File]::Open($vdiPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
$zip = New-Object System.IO.Compression.ZipArchive($fileStream, [System.IO.Compression.ZipArchiveMode]::Read)

$sharedStrings = @()
$sharedStringsEntry = $zip.Entries | Where-Object { $_.FullName -eq 'xl/sharedStrings.xml' }
if ($sharedStringsEntry) {
    $reader = New-Object System.IO.StreamReader($sharedStringsEntry.Open())
    $xml = [xml]$reader.ReadToEnd()
    $reader.Close()
    $sharedStrings = @($xml.sst.si | ForEach-Object { if ($_.t) { $_.t } elseif ($_.r) { ($_.r | ForEach-Object { $_.t }) -join '' } else { '' } })
}

$sheetEntry = $zip.Entries | Where-Object { $_.FullName -eq 'xl/worksheets/sheet1.xml' }
$reader = New-Object System.IO.StreamReader($sheetEntry.Open())
$sXml = [xml]$reader.ReadToEnd()
$reader.Close()
$rows = $sXml.worksheet.sheetData.row

$vdiSqlPath = Join-Path $outputDir 'import_vdi_from_sep_01_2026.sql'
$sqlWriter = New-Object System.IO.StreamWriter($vdiSqlPath, $false, [System.Text.Encoding]::UTF8)

$sqlWriter.WriteLine("-- =============================================================================")
$sqlWriter.WriteLine("-- Quality Control / VDI Inspection Import (From 01-Sep-2026)")
$sqlWriter.WriteLine("-- Source: VDI Report.xlsx")
$sqlWriter.WriteLine("-- =============================================================================")
$sqlWriter.WriteLine("BEGIN;")
$sqlWriter.WriteLine("")
$sqlWriter.WriteLine("CREATE TEMP TABLE temp_vdi_import (")
$sqlWriter.WriteLine("  work_order_no text,")
$sqlWriter.WriteLine("  inspection_date date,")
$sqlWriter.WriteLine("  insp_pcs integer,")
$sqlWriter.WriteLine("  accept_pcs integer,")
$sqlWriter.WriteLine("  salvage_pcs integer,")
$sqlWriter.WriteLine("  reject_pcs integer,")
$sqlWriter.WriteLine("  accept_mt numeric,")
$sqlWriter.WriteLine("  salvage_reason text,")
$sqlWriter.WriteLine("  reject_reason text,")
$sqlWriter.WriteLine("  heat_no text")
$sqlWriter.WriteLine(") ON COMMIT DROP;")
$sqlWriter.WriteLine("")

$batch = @()
$vCount = 0; $vTotInsp = 0; $vTotOk = 0; $vTotSal = 0; $vTotRej = 0; $vTotMt = 0.0

for ($i = 1; $i -lt $rows.Count; $i++) {
    $vals = @{}
    foreach ($c in $rows[$i].c) {
        $col = $c.r -replace '\d+',''
        $val = $c.v
        if ($c.t -eq 's' -and $val -ne $null) { $val = $sharedStrings[[int]$val] }
        $vals[$col] = $val
    }
    $oa = 0.0
    if ($vals['A'] -as [double]) { $oa = [double]$vals['A'] }
    if ($oa -lt $targetOa) { continue }
    
    $wo = if ($vals['C']) { ($vals['C']).ToString().Trim() } else { if ($vals['D']) { ($vals['D']).ToString().Trim() } else { '' } }
    if (-not $wo -or $wo -match '^Total') { continue }
    
    $dateStr = "'" + [DateTime]::FromOADate($oa).ToString('yyyy-MM-dd') + "'::date"
    $insp = if ($vals['K'] -as [double]) { [Math]::Round([double]$vals['K']) } else { 0 }
    $ok = if ($vals['L'] -as [double]) { [Math]::Round([double]$vals['L']) } else { 0 }
    $sal = if ($vals['M'] -as [double]) { [Math]::Round([double]$vals['M']) } else { 0 }
    $rej = if ($vals['N'] -as [double]) { [Math]::Round([double]$vals['N']) } else { 0 }
    $mt = if ($vals['W'] -as [double]) { [double]$vals['W'] } else { 0.0 }
    if ($insp -le 0 -and $ok -le 0) { continue }
    
    $salReas = Escape-Sql $vals['O']
    $rejReas = Escape-Sql $vals['P']
    $heat = Escape-Sql $vals['F']
    $woSql = Escape-Sql $wo
    
    $batch += "($woSql, $dateStr, $insp, $ok, $sal, $rej, $mt, $salReas, $rejReas, $heat)"
    $vCount++; $vTotInsp += $insp; $vTotOk += $ok; $vTotSal += $sal; $vTotRej += $rej; $vTotMt += $mt
}

if ($batch.Count -gt 0) {
    $sqlWriter.WriteLine("INSERT INTO temp_vdi_import (work_order_no, inspection_date, insp_pcs, accept_pcs, salvage_pcs, reject_pcs, accept_mt, salvage_reason, reject_reason, heat_no) VALUES")
    $sqlWriter.WriteLine(($batch -join ",`n") + ";")
    $sqlWriter.WriteLine("")
}

$sqlWriter.WriteLine("INSERT INTO public.qc_inspections (")
$sqlWriter.WriteLine("  work_order_id,")
$sqlWriter.WriteLine("  process_route_id,")
$sqlWriter.WriteLine("  inspection_date,")
$sqlWriter.WriteLine("  inspected_pcs,")
$sqlWriter.WriteLine("  inspected_mtr,")
$sqlWriter.WriteLine("  inspected_mt,")
$sqlWriter.WriteLine("  vdi_ok_pcs,")
$sqlWriter.WriteLine("  vdi_ok_mtr,")
$sqlWriter.WriteLine("  vdi_ok_mt,")
$sqlWriter.WriteLine("  vdi_salvage_pcs,")
$sqlWriter.WriteLine("  vdi_salvage_mtr,")
$sqlWriter.WriteLine("  vdi_salvage_mt,")
$sqlWriter.WriteLine("  vdi_rejection_pcs,")
$sqlWriter.WriteLine("  vdi_rejection_mtr,")
$sqlWriter.WriteLine("  vdi_rejection_mt,")
$sqlWriter.WriteLine("  salvage_reasons,")
$sqlWriter.WriteLine("  remarks")
$sqlWriter.WriteLine(")")
$sqlWriter.WriteLine("SELECT")
$sqlWriter.WriteLine("  wo.id AS work_order_id,")
$sqlWriter.WriteLine("  COALESCE(")
$sqlWriter.WriteLine("    (SELECT rp.process_route_id FROM public.rolling_plans rp WHERE rp.work_order_id = wo.id ORDER BY rp.created_at DESC LIMIT 1),")
$sqlWriter.WriteLine("    (SELECT pr.id FROM public.process_routes pr WHERE pr.route_code = 'CDS' LIMIT 1)")
$sqlWriter.WriteLine("  ) AS process_route_id,")
$sqlWriter.WriteLine("  t.inspection_date,")
$sqlWriter.WriteLine("  t.insp_pcs,")
$sqlWriter.WriteLine("  t.insp_pcs * public.wo_avg_length(wo.id) AS inspected_mtr,")
$sqlWriter.WriteLine("  t.accept_mt AS inspected_mt,")
$sqlWriter.WriteLine("  t.accept_pcs,")
$sqlWriter.WriteLine("  t.accept_pcs * public.wo_avg_length(wo.id) AS vdi_ok_mtr,")
$sqlWriter.WriteLine("  t.accept_mt AS vdi_ok_mt,")
$sqlWriter.WriteLine("  t.salvage_pcs,")
$sqlWriter.WriteLine("  t.salvage_pcs * public.wo_avg_length(wo.id) AS vdi_salvage_mtr,")
$sqlWriter.WriteLine("  0 AS vdi_salvage_mt,")
$sqlWriter.WriteLine("  t.reject_pcs,")
$sqlWriter.WriteLine("  t.reject_pcs * public.wo_avg_length(wo.id) AS vdi_rejection_mtr,")
$sqlWriter.WriteLine("  0 AS vdi_rejection_mt,")
$sqlWriter.WriteLine("  CASE WHEN t.salvage_reason IS NOT NULL AND t.salvage_reason <> '' THEN jsonb_build_array(t.salvage_reason) ELSE '[]'::jsonb END AS salvage_reasons,")
$sqlWriter.WriteLine("  TRIM(COALESCE('Heat: ' || t.heat_no || ' ' || COALESCE('Rej: ' || t.reject_reason, ''), '')) AS remarks")
$sqlWriter.WriteLine("FROM temp_vdi_import t")
$sqlWriter.WriteLine("JOIN public.work_orders wo ON (")
$sqlWriter.WriteLine("  UPPER(TRIM(wo.work_order_no)) = UPPER(TRIM(t.work_order_no))")
$sqlWriter.WriteLine("  OR UPPER(TRIM(wo.work_order_no)) = UPPER('DOM-' || LPAD(TRIM(t.work_order_no), 5, '0'))")
$sqlWriter.WriteLine("  OR UPPER(TRIM(REPLACE(wo.work_order_no, 'DOM-', ''))) = UPPER(TRIM(REPLACE(t.work_order_no, 'DOM-', '')))")
$sqlWriter.WriteLine("  OR UPPER(TRIM(REPLACE(wo.work_order_no, 'DOM-BHEL-', 'DOM-'))) = UPPER(TRIM(REPLACE(t.work_order_no, 'DOM-BHEL-', 'DOM-')))")
$sqlWriter.WriteLine("  OR UPPER(TRIM(REPLACE(wo.work_order_no, 'DOM-BHEL-', ''))) = UPPER(TRIM(REPLACE(t.work_order_no, 'DOM-BHEL-', '')))")
$sqlWriter.WriteLine(");")
$sqlWriter.WriteLine("")
$sqlWriter.WriteLine("COMMIT;")

$sqlWriter.Close()
$sqlWriter.Dispose()
$zip.Dispose()
$fileStream.Close()
$fileStream.Dispose()
Write-Host "VDI QC Inspection: $vCount rows ($vTotInsp Insp Pcs, $vTotOk OK Pcs, $vTotSal Salvage, $vTotRej Rej, $vTotMt MT)"

# =========================================================================
# 3. HTC (ROLLING HTC OK)
# =========================================================================
$htcPath = Join-Path $trackingDir 'HTC Report.xlsx'
$fileStream = [System.IO.File]::Open($htcPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
$zip = New-Object System.IO.Compression.ZipArchive($fileStream, [System.IO.Compression.ZipArchiveMode]::Read)

$sharedStrings = @()
$sharedStringsEntry = $zip.Entries | Where-Object { $_.FullName -eq 'xl/sharedStrings.xml' }
if ($sharedStringsEntry) {
    $reader = New-Object System.IO.StreamReader($sharedStringsEntry.Open())
    $xml = [xml]$reader.ReadToEnd()
    $reader.Close()
    $sharedStrings = @($xml.sst.si | ForEach-Object { if ($_.t) { $_.t } elseif ($_.r) { ($_.r | ForEach-Object { $_.t }) -join '' } else { '' } })
}

$sheetEntry = $zip.Entries | Where-Object { $_.FullName -eq 'xl/worksheets/sheet1.xml' }
$reader = New-Object System.IO.StreamReader($sheetEntry.Open())
$sXml = [xml]$reader.ReadToEnd()
$reader.Close()
$rows = $sXml.worksheet.sheetData.row

$htcSqlPath = Join-Path $outputDir 'import_htc_from_sep_01_2026.sql'
$sqlWriter = New-Object System.IO.StreamWriter($htcSqlPath, $false, [System.Text.Encoding]::UTF8)

$sqlWriter.WriteLine("-- =============================================================================")
$sqlWriter.WriteLine("-- Rolling HTC OK Production Import (From 01-Sep-2026)")
$sqlWriter.WriteLine("-- Source: HTC Report.xlsx")
$sqlWriter.WriteLine("-- =============================================================================")
$sqlWriter.WriteLine("BEGIN;")
$sqlWriter.WriteLine("")
$sqlWriter.WriteLine("CREATE TEMP TABLE temp_htc_import (")
$sqlWriter.WriteLine("  work_order_no text,")
$sqlWriter.WriteLine("  process_date date,")
$sqlWriter.WriteLine("  rec_pcs integer,")
$sqlWriter.WriteLine("  htc_ok_pcs integer,")
$sqlWriter.WriteLine("  rej_pcs integer,")
$sqlWriter.WriteLine("  len numeric,")
$sqlWriter.WriteLine("  mt numeric,")
$sqlWriter.WriteLine("  heat_no text,")
$sqlWriter.WriteLine("  bundle_no text,")
$sqlWriter.WriteLine("  shift text,")
$sqlWriter.WriteLine("  defect_reason text")
$sqlWriter.WriteLine(") ON COMMIT DROP;")
$sqlWriter.WriteLine("")

$batch = @()
$hCount = 0; $hTotRec = 0; $hTotOk = 0; $hTotRej = 0; $hTotMt = 0.0

for ($i = 1; $i -lt $rows.Count; $i++) {
    $vals = @{}
    foreach ($c in $rows[$i].c) {
        $col = $c.r -replace '\d+',''
        $val = $c.v
        if ($c.t -eq 's' -and $val -ne $null) { $val = $sharedStrings[[int]$val] }
        $vals[$col] = $val
    }
    $oa = 0.0
    if ($vals['A'] -as [double]) { $oa = [double]$vals['A'] }
    if ($oa -lt $targetOa) { continue }
    
    $wo = if ($vals['E']) { ($vals['E']).ToString().Trim() } else { if ($vals['F']) { ($vals['F']).ToString().Trim() } else { '' } }
    if (-not $wo -or $wo -match '^Total') { continue }
    
    $dateStr = "'" + [DateTime]::FromOADate($oa).ToString('yyyy-MM-dd') + "'::date"
    $rec = if ($vals['M'] -as [double]) { [Math]::Round([double]$vals['M']) } else { 0 }
    $ok = if ($vals['Q'] -as [double]) { [Math]::Round([double]$vals['Q']) } else { if ($vals['N'] -as [double]) { [Math]::Round([double]$vals['N']) } else { 0 } }
    $rej = if ($vals['S'] -as [double]) { [Math]::Round([double]$vals['S']) } else { 0 }
    $len = if ($vals['K'] -as [double]) { [double]$vals['K'] } else { 0.0 }
    $mt = if ($vals['R'] -as [double]) { [double]$vals['R'] } else { 0.0 }
    if ($rec -le 0 -and $ok -le 0) { continue }
    
    $heat = Escape-Sql $vals['G']
    $bNo = Escape-Sql $vals['L']
    $shift = Escape-Sql $vals['C']
    $defect = Escape-Sql $vals['U']
    $woSql = Escape-Sql $wo
    
    $batch += "($woSql, $dateStr, $rec, $ok, $rej, $len, $mt, $heat, $bNo, $shift, $defect)"
    $hCount++; $hTotRec += $rec; $hTotOk += $ok; $hTotRej += $rej; $hTotMt += $mt
}

if ($batch.Count -gt 0) {
    $sqlWriter.WriteLine("INSERT INTO temp_htc_import (work_order_no, process_date, rec_pcs, htc_ok_pcs, rej_pcs, len, mt, heat_no, bundle_no, shift, defect_reason) VALUES")
    $sqlWriter.WriteLine(($batch -join ",`n") + ";")
    $sqlWriter.WriteLine("")
}

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
$sqlWriter.WriteLine("  (SELECT id FROM public.process_stages WHERE stage_code = 'ROLLING' LIMIT 1) AS stage_id,")
$sqlWriter.WriteLine("  COALESCE(")
$sqlWriter.WriteLine("    (SELECT rp.process_route_id FROM public.rolling_plans rp WHERE rp.work_order_id = wo.id ORDER BY rp.created_at DESC LIMIT 1),")
$sqlWriter.WriteLine("    (SELECT pr.id FROM public.process_routes pr WHERE pr.route_code = 'CDS' LIMIT 1)")
$sqlWriter.WriteLine("  ) AS process_route_id,")
$sqlWriter.WriteLine("  t.process_date,")
$sqlWriter.WriteLine("  t.rec_pcs * COALESCE(NULLIF(t.len, 0), public.wo_avg_length(wo.id), 6.0) AS input_qty,")
$sqlWriter.WriteLine("  t.htc_ok_pcs * COALESCE(NULLIF(t.len, 0), public.wo_avg_length(wo.id), 6.0) AS output_qty,")
$sqlWriter.WriteLine("  t.rej_pcs * COALESCE(NULLIF(t.len, 0), public.wo_avg_length(wo.id), 6.0) AS rejection_qty,")
$sqlWriter.WriteLine("  t.htc_ok_pcs * COALESCE(NULLIF(t.len, 0), public.wo_avg_length(wo.id), 6.0) AS htc_ok,")
$sqlWriter.WriteLine("  t.heat_no,")
$sqlWriter.WriteLine("  TRIM(COALESCE('Bundle: ' || t.bundle_no || ' Shift: ' || t.shift || ' ' || COALESCE('Defect: ' || t.defect_reason, ''), '') || ' [PCS:' || t.htc_ok_pcs || '] [REJ_PCS:' || t.rej_pcs || ']') AS remarks")
$sqlWriter.WriteLine("FROM temp_htc_import t")
$sqlWriter.WriteLine("JOIN public.work_orders wo ON (")
$sqlWriter.WriteLine("  UPPER(TRIM(wo.work_order_no)) = UPPER(TRIM(t.work_order_no))")
$sqlWriter.WriteLine("  OR UPPER(TRIM(wo.work_order_no)) = UPPER('DOM-' || LPAD(TRIM(t.work_order_no), 5, '0'))")
$sqlWriter.WriteLine("  OR UPPER(TRIM(REPLACE(wo.work_order_no, 'DOM-', ''))) = UPPER(TRIM(REPLACE(t.work_order_no, 'DOM-', '')))")
$sqlWriter.WriteLine("  OR UPPER(TRIM(REPLACE(wo.work_order_no, 'DOM-BHEL-', 'DOM-'))) = UPPER(TRIM(REPLACE(t.work_order_no, 'DOM-BHEL-', 'DOM-')))")
$sqlWriter.WriteLine("  OR UPPER(TRIM(REPLACE(wo.work_order_no, 'DOM-BHEL-', ''))) = UPPER(TRIM(REPLACE(t.work_order_no, 'DOM-BHEL-', '')))")
$sqlWriter.WriteLine(");")
$sqlWriter.WriteLine("")
$sqlWriter.WriteLine("DO `$body`$")
$sqlWriter.WriteLine("DECLARE")
$sqlWriter.WriteLine("  r RECORD;")
$sqlWriter.WriteLine("BEGIN")
$sqlWriter.WriteLine("  FOR r IN")
$sqlWriter.WriteLine("    SELECT DISTINCT wo.id")
$sqlWriter.WriteLine("    FROM temp_htc_import t")
$sqlWriter.WriteLine("    JOIN public.work_orders wo ON (")
$sqlWriter.WriteLine("      UPPER(TRIM(wo.work_order_no)) = UPPER(TRIM(t.work_order_no))")
$sqlWriter.WriteLine("      OR UPPER(TRIM(wo.work_order_no)) = UPPER('DOM-' || LPAD(TRIM(t.work_order_no), 5, '0'))")
$sqlWriter.WriteLine("      OR UPPER(TRIM(REPLACE(wo.work_order_no, 'DOM-', ''))) = UPPER(TRIM(REPLACE(t.work_order_no, 'DOM-', '')))")
$sqlWriter.WriteLine("      OR UPPER(TRIM(REPLACE(wo.work_order_no, 'DOM-BHEL-', 'DOM-'))) = UPPER(TRIM(REPLACE(t.work_order_no, 'DOM-BHEL-', 'DOM-')))")
$sqlWriter.WriteLine("      OR UPPER(TRIM(REPLACE(wo.work_order_no, 'DOM-BHEL-', ''))) = UPPER(TRIM(REPLACE(t.work_order_no, 'DOM-BHEL-', '')))")
$sqlWriter.WriteLine("    )")
$sqlWriter.WriteLine("  LOOP")
$sqlWriter.WriteLine("    PERFORM public.recalculate_work_order_wip(r.id);")
$sqlWriter.WriteLine("  END LOOP;")
$sqlWriter.WriteLine("END `$body`$;")
$sqlWriter.WriteLine("")
$sqlWriter.WriteLine("COMMIT;")

$sqlWriter.Close()
$sqlWriter.Dispose()
$zip.Dispose()
$fileStream.Close()
$fileStream.Dispose()
Write-Host "HTC Rolling OK: $hCount rows ($hTotRec Rec Pcs, $hTotOk OK Pcs, $hTotRej Rej, $hTotMt MT)"

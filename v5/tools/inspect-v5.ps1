param([string]$Source = 'C:\Users\johnn\Downloads\RPG_角色生成器_V5_完整可編輯.xlsx')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($Source)
function Read-Xml($name) {
  $entry = $zip.GetEntry($name)
  if (!$entry) { return $null }
  $reader = [IO.StreamReader]::new($entry.Open())
  try { return [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }
}
try {
  $strings = @()
  $shared = Read-Xml 'xl/sharedStrings.xml'
  if ($shared) { $strings = @($shared.sst.si | ForEach-Object { $_.InnerText }) }
  $book = Read-Xml 'xl/workbook.xml'
  $rels = Read-Xml 'xl/_rels/workbook.xml.rels'
  $sheets = @()
  foreach ($sheet in $book.workbook.sheets.sheet) {
    $rid = $sheet.GetAttribute('id','http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    $target = ($rels.Relationships.Relationship | Where-Object Id -eq $rid).Target
    $path = if ($target.StartsWith('/')) { $target.TrimStart('/') } else { 'xl/' + $target }
    $xml = Read-Xml $path
    $rows = @()
    foreach ($row in $xml.worksheet.sheetData.row) {
      $cells = @()
      foreach ($cell in $row.c) {
        $value = if ($cell.t -eq 's') { $strings[[int]$cell.v] } elseif ($cell.t -eq 'inlineStr') { $cell.is.InnerText } else { [string]$cell.v }
        $formula = if ($cell.f -is [System.Xml.XmlElement]) { $cell.f.InnerText } else { [string]$cell.f }
        $formulaMeta = if ($cell.f -is [System.Xml.XmlElement]) { $cell.f.OuterXml } else { $null }
        if ($value -ne '' -or $cell.f) { $cells += [ordered]@{cell=[string]$cell.r; value=$value; formula=$formula; formulaXml=$formulaMeta; type=[string]$cell.t} }
      }
      if ($cells.Count) { $rows += ,([ordered]@{row=[int]$row.r; cells=$cells}) }
    }
    $sheets += [ordered]@{name=[string]$sheet.name; dimension=[string]$xml.worksheet.dimension.ref; rows=$rows}
  }
  $output = Join-Path $PSScriptRoot '..\evidence'
  New-Item -ItemType Directory -Force -Path $output | Out-Null
  $result = [ordered]@{source=$Source; sha256=(Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash; sheets=$sheets}
  $result | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath (Join-Path $output 'workbook-inspection.json') -Encoding UTF8
  foreach ($s in $sheets) {
    "=== $($s.name) [$($s.dimension)] ==="
    foreach ($r in $s.rows) { ($r.cells | ForEach-Object { "$($_.cell): $($_.value)$(if ($_.formula) { ' [=' + $_.formula + ']' })" }) -join ' | ' }
  }
} finally { $zip.Dispose() }

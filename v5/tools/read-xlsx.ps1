param([Parameter(Mandatory=$true)][string]$Source, [Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead($Source)
function ReadXml($path) {
  $entry=$zip.GetEntry($path)
  if (!$entry) { return $null }
  $reader=[IO.StreamReader]::new($entry.Open())
  try {
    $settings=[Xml.XmlReaderSettings]::new()
    $settings.DtdProcessing=[Xml.DtdProcessing]::Prohibit
    $settings.XmlResolver=$null
    $xmlReader=[Xml.XmlReader]::Create($reader,$settings)
    try { $doc=[Xml.XmlDocument]::new(); $doc.Load($xmlReader); return $doc } finally { $xmlReader.Dispose() }
  } finally {$reader.Dispose()}
}
try {
  $ss=ReadXml 'xl/sharedStrings.xml'
  $strings=@(); if($ss) {$strings=@($ss.sst.si | ForEach-Object {$_.InnerText})}
  $book=ReadXml 'xl/workbook.xml'
  $rels=ReadXml 'xl/_rels/workbook.xml.rels'
  $sheets=@()
  foreach($sheet in $book.workbook.sheets.sheet) {
    $rid=$sheet.GetAttribute('id','http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    $target=($rels.Relationships.Relationship | Where-Object Id -eq $rid).Target
    $path=if($target.StartsWith('/')) {$target.TrimStart('/')} else {'xl/'+$target}
    $xml=ReadXml $path
    $rows=@()
    foreach($row in $xml.worksheet.sheetData.row) {
      $cells=@()
      foreach($c in $row.c) {
        $v=if($c.t -eq 's') {$strings[[int]$c.v]} elseif($c.t -eq 'inlineStr') {$c.is.InnerText} else {[string]$c.v}
        $f=$c.SelectSingleNode('*[local-name()="f"]')
        if($v -ne '' -or $f) {
          $cells+=@{cell=[string]$c.r;value=$v;type=[string]$c.t;formula=$(if($f){$f.InnerText}else{''});formulaXml=$(if($f){$f.OuterXml}else{$null})}
        }
      }
      if($cells.Count){$rows+=@{row=[int]$row.r;cells=$cells}}
    }
    $sheets+=@{name=[string]$sheet.name;rows=$rows}
  }
  @{sha256=(Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash;source=[IO.Path]::GetFileName($Source);sheets=$sheets} | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $Output -Encoding UTF8
} finally {$zip.Dispose()}

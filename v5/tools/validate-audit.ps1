$ErrorActionPreference = 'Stop'
$d = Get-Content (Join-Path $PSScriptRoot '..\evidence\workbook-inspection.json') -Raw -Encoding UTF8 | ConvertFrom-Json
function Cells($name) { $map=@{}; foreach($r in ($d.sheets | Where-Object name -eq $name).rows) { foreach($c in $r.cells) {$map[$c.cell]=$c.value} }; return $map }
function Table($name) { $s=$d.sheets | Where-Object name -eq $name; $headers=@{}; foreach($c in $s.rows[0].cells) {$headers[$c.cell -replace '\d','']=$c.value}; foreach($r in $s.rows | Select-Object -Skip 1) {$o=[ordered]@{_row=$r.row}; foreach($c in $r.cells) {$o[$headers[$c.cell -replace '\d','']]=$c.value}; [pscustomobject]$o} }
$issues=[Collections.Generic.List[object]]::new()
function Issue($code,$location,$detail) { $issues.Add([ordered]@{code=$code;location=$location;detail=$detail}) }
$keys=@{'族系'='族系ID';'種族設定'='種族ID';'基礎能力'='能力ID';'稀有度'='稀有度ID';'個性'='個性ID';'外觀選項'='外觀ID';'美術素材庫'='素材ID';'動畫骨架'='骨架ID';'外觀生成規則'='規則ID';'技能效果索引'='技能ID';'先天天賦與綁定'='天賦ID';'計分參數'='參數';'成長潛力'='評級'}
$tables=@{}
foreach($name in $keys.Keys) { $tables[$name]=@(Table $name); $key=$keys[$name]; foreach($g in $tables[$name] | Group-Object -Property $key | Where-Object Count -gt 1) {Issue 'DUPLICATE_ID' $name $g.Name} }
foreach($spec in @(@('種族設定','種族出現權重'),@('個性','抽取權重'),@('外觀選項','權重'),@('先天天賦與綁定','抽取權重'))) {foreach($r in $tables[$spec[0]]) {$n=0.0; if(![double]::TryParse($r.($spec[1]),[ref]$n) -or $n -lt 0) {Issue 'INVALID_WEIGHT' "$($spec[0]) row $($r._row)" $r.($spec[1])}}}
foreach($spec in @(@('種族設定','族系ID','族系','族系ID'),@('種族設定','預設身體ID','美術素材庫','素材ID'),@('種族設定','骨架ID','動畫骨架','骨架ID'),@('先天天賦與綁定','對應技能ID','技能效果索引','技能ID'),@('美術素材庫','對應種族ID','種族設定','種族ID'),@('美術素材庫','骨架ID','動畫骨架','骨架ID'),@('外觀生成規則','種族ID','種族設定','種族ID'),@('外觀生成規則','族系ID','族系','族系ID'),@('外觀生成規則','骨架ID','動畫骨架','骨架ID'))) {foreach($r in $tables[$spec[0]]) { $v=$r.($spec[1]); if($v -and $v -notin $tables[$spec[2]].($spec[3])) {Issue 'MISSING_REFERENCE' "$($spec[0]) row $($r._row)" "$($spec[1])=$v"}}}
$p=Cells '計分參數'
foreach($r in $tables['種族設定']) {
  foreach($field in @('最小寬','最大寬','最小高','最大高')) {$v=[double]$r.$field; if($v -le 0 -or $v -ne [math]::Floor($v)) {Issue 'INVALID_SIZE' $r.種族ID $field}}
  if([double]$r.最小寬 -gt [double]$r.最大寬 -or [double]$r.最小高 -gt [double]$r.最大高 -or [double]$r.最大寬 -gt [double]$p.B2 -or [double]$r.最大高 -gt [double]$p.B3) {Issue 'INVALID_SIZE_RANGE' $r.種族ID 'range/global limit'}
  $visual=@($tables['外觀生成規則'] | Where-Object 種族ID -eq $r.種族ID)
  if(!$visual.Count) {Issue 'MISSING_VISUAL_RULE' $r.種族ID 'no rule'}
  foreach($v in $visual) {if($v.族系ID -ne $r.族系ID -or $v.骨架ID -ne $r.骨架ID) {Issue 'VISUAL_MISMATCH' $r.種族ID $v.規則ID}}
  $body=$tables['美術素材庫'] | Where-Object 素材ID -eq $r.預設身體ID
  if($body.所屬族系 -ne $r.族系ID -or $body.骨架ID -ne $r.骨架ID -or $body.對應種族ID -ne $r.種族ID) {Issue 'BODY_MAPPING_REVIEW' $r.種族ID $r.預設身體ID}
}
$ranges=@($tables['稀有度'] | Where-Object 啟用 -eq '1' | Sort-Object {[double]$_.總分下限})
for($i=0;$i -lt $ranges.Count;$i++) {if([double]$ranges[$i].總分下限 -gt [double]$ranges[$i].總分上限) {Issue 'INVALID_RARITY_RANGE' $ranges[$i].稀有度ID 'min > max'}; if($i -gt 0) {if([double]$ranges[$i].總分下限 -le [double]$ranges[$i-1].總分上限) {Issue 'RARITY_OVERLAP' $ranges[$i].稀有度ID 'overlap'}; if([double]$ranges[$i].總分下限 -gt 1+[double]$ranges[$i-1].總分上限) {Issue 'RARITY_GAP' $ranges[$i].稀有度ID 'gap'}}}
function Rarity([double]$score) { $n=[math]::Floor($score); $hits=@($ranges | Where-Object { $n -ge [double]$_.總分下限 -and $n -le [double]$_.總分上限 }); if($hits.Count -ne 1) {return 'INVALID'}; return $hits[0].稀有度ID }
$tests=[Collections.Generic.List[object]]::new()
function Check($name,$actual,$expected) { $pass=if($actual -is [double]) {[math]::Abs($actual-[double]$expected) -lt 1e-8} else {$actual -eq $expected}; $tests.Add([ordered]@{name=$name;actual=$actual;expected=$expected;pass=$pass}) }
$c=Cells '角色計算'; $a=Cells '基礎能力'; $g=Cells '成長潛力'
$bag=[math]::Max(0,[double]$c.B4*[double]$c.B5-[double]$p.B5)*[double]$p.B4*[double]$p.B12
$base=0.0; for($i=2;$i -le 5;$i++) {$base+=([double]$c[('B'+($i+6))]-[double]$a[('H'+$i)])/[double]$a[('D'+$i)]}
$skill=0.0; for($i=21;$i -le 25;$i++) {$id=$c[('B'+$i)]; if($id) {$skill += [double]($tables['技能效果索引'] | Where-Object 技能ID -eq $id).生成取得成本分}}
$hidden=0.0; for($i=26;$i -le 29;$i++) {$id=$c[('B'+$i)]; $hidden += [double]($tables['成長潛力'] | Where-Object 評級 -eq $id).隱藏成本分}
$total=$bag+$base+$skill+$hidden
Check 'bag' $bag ([double]$c.B7); Check 'base' $base ([double]$c.B12); Check 'skills' $skill ([double]$c.B13); Check 'potential' $hidden ([double]$c.B14); Check 'total' $total ([double]$c.B15); Check 'remaining budget' ([double]$c.B6-$total) ([double]$c.B16)
foreach($case in @(@(0,'RAR_C'),@(119.999,'RAR_C'),@(120,'RAR_R'),@(199.999,'RAR_R'),@(200,'RAR_E'),@(299.999,'RAR_E'),@(300,'RAR_L'),@(399.999,'RAR_L'),@(400,'RAR_M'),@(999999,'RAR_M'),@(1000000,'INVALID'),@(-0.1,'INVALID'))) {Check "rarity $($case[0])" (Rarity $case[0]) $case[1]}
foreach($r in ($d.sheets | Where-Object name -eq '測試與檢查').rows | Select-Object -Skip 1) { $m=@{}; foreach($v in $r.cells) {$m[$v.cell -replace '\d','']=$v.value}; Check "workbook sum row $($r.row)" ([double]$m.B+[double]$m.C+[double]$m.D+[double]$m.E) ([double]$m.G) }
foreach($s in $d.sheets | Where-Object name -ne 'V4原值與註解') {foreach($r in $s.rows) {foreach($cell in $r.cells) {if($cell.type -eq 'e' -or $cell.formula -match '#REF!') {Issue 'FORMULA_ERROR' "$($s.name)!$($cell.cell)" $cell.value}}}}
$out=[ordered]@{sourceSha256=$d.sha256;sheetCount=$d.sheets.Count;recordCounts=@{};issues=$issues;tests=$tests;note='Independent arithmetic and structural checks; no Excel engine recalculation. Not a production importer.'}
foreach($name in $tables.Keys) {$out.recordCounts[$name]=$tables[$name].Count}
$out | ConvertTo-Json -Depth 20 | Set-Content (Join-Path $PSScriptRoot '..\evidence\validation-results.json') -Encoding UTF8
$issues | ForEach-Object {"$($_.code) | $($_.location) | $($_.detail)"}
"Tests: $(@($tests | Where-Object pass).Count)/$($tests.Count) passed"
if(@($tests | Where-Object { !$_.pass }).Count) {throw 'Audit reconciliation failed'}

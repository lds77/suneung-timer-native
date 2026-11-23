# EAS에서 받은 APK/AAB, mapping.txt, r8-metadata.dat를 내용으로 대조한다.
# powershell -ExecutionPolicy Bypass -File scripts/check-r8.ps1 -Artifact <apk|aab> -Mapping <mapping.txt> -Metadata <r8-metadata.dat>
# Gradle 캐시를 재사용할 수 있으므로 수정 시각은 검사하지 않는다. Play 수치는 업로드 후 별도로 확인한다.
# Windows PowerShell 5.1용 UTF-8 BOM.

param(
  [Parameter(Mandatory = $true)][string]$Artifact,
  [Parameter(Mandatory = $true)][string]$Mapping,
  [Parameter(Mandatory = $true)][string]$Metadata,
  [ValidateRange(0, 100)][double]$MinPercent = 25
)

$ErrorActionPreference = 'Stop'
function Fail([string]$msg) {
  Write-Output "R8 확인 실패: $msg"
  exit 1
}

if (-not (Test-Path -LiteralPath $Artifact)) { Fail "산출물이 없다 ($Artifact)" }
if (-not (Test-Path -LiteralPath $Mapping)) { Fail "난독화 지도가 없다 ($Mapping)" }
if (-not (Test-Path -LiteralPath $Metadata)) { Fail "R8 기록이 없다 ($Metadata)" }

# 1) 지도의 ID
$mapId = $null
foreach ($line in (Get-Content -LiteralPath $Mapping -TotalCount 30 -Encoding UTF8)) {
  if ($line -match '^# pg_map_id: ([0-9a-f]+)\s*$') { $mapId = $Matches[1]; break }
}
if (-not $mapId) { Fail "지도 머리에 pg_map_id가 없다" }

# 2) 산출물의 DEX — SHA-256과 R8 표식 (APK는 classes*.dex, AAB는 base/dex/classes*.dex)
$dexPattern = switch ([IO.Path]::GetExtension($Artifact)) {
  '.apk' { '^classes\d*\.dex$' }
  '.aab' { '^base/dex/classes\d*\.dex$' }
  default { Fail "지원하지 않는 산출물 형식 ($Artifact)" }
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$sha = [System.Security.Cryptography.SHA256]::Create()
$dexSums = @()
$markerIds = @()
$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $Artifact).Path)
try {
  foreach ($e in $zip.Entries) {
    if ($e.FullName -notmatch $dexPattern) { continue }
    $s = $e.Open()
    $ms = New-Object System.IO.MemoryStream
    try {
      $s.CopyTo($ms)
      $bytes = $ms.ToArray()
    } finally {
      $ms.Dispose()
      $s.Dispose()
    }
    $dexSums += (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '')
    $text = [System.Text.Encoding]::ASCII.GetString($bytes)
    foreach ($m in [regex]::Matches($text, '~~R8\{[^}]*"pg-map-id":"([0-9a-f]+)"')) { $markerIds += $m.Groups[1].Value }
  }
} finally {
  $zip.Dispose()
  $sha.Dispose()
}
if ($dexSums.Count -eq 0) { Fail "산출물에 DEX가 없다" }
if ($markerIds.Count -eq 0) { Fail "DEX에 R8 표식이 없다 — R8이 돌지 않았다" }
if (@($markerIds | Where-Object { $_ -ne $mapId }).Count -gt 0) { Fail "지도가 이 산출물의 것이 아니다 (지도 $mapId)" }

# 3) R8 기록이 이 산출물의 것인가, 그리고 비율
$meta = Get-Content -LiteralPath $Metadata -Raw -Encoding UTF8 | ConvertFrom-Json
$metaSums = @($meta.dexFiles | ForEach-Object { $_.checksum })
if ((($dexSums | Sort-Object) -join ',') -ne (($metaSums | Sort-Object) -join ',')) {
  Fail "R8 기록이 이 산출물의 것이 아니다 (DEX 체크섬이 다르다)"
}

$st = $meta.stats
foreach ($field in 'noObfuscationPercentage', 'noOptimizationPercentage', 'noShrinkingPercentage') {
  # 누락/null을 double로 바꾸면 0이 되어 실제로는 측정하지 않은 항목이 100%로 통과한다.
  $value = $st.$field
  if (($value -isnot [int] -and $value -isnot [long] -and $value -isnot [decimal] -and $value -isnot [double]) -or
      [double]::IsNaN($value) -or $value -lt 0 -or $value -gt 100) { Fail "잘못된 R8 통계: $field" }
}
$done = [ordered]@{
  '난독화' = 100 - [double]$st.noObfuscationPercentage
  '최적화' = 100 - [double]$st.noOptimizationPercentage
  '코드 축소' = 100 - [double]$st.noShrinkingPercentage
}
$summary = ($done.GetEnumerator() | ForEach-Object { '{0} {1:N1}%' -f $_.Key, $_.Value }) -join ' · '
Write-Output "R8: $summary (기준 각 $MinPercent% 이상, DEX $($dexSums.Count)개)"
foreach ($k in @($done.Keys)) {
  if ($done[$k] -lt $MinPercent) { Fail "$k 비율이 기준 미달 ($($done[$k])%)" }
}
Write-Output 'R8 확인 통과'
exit 0

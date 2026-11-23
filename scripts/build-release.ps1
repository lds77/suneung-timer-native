# Windows에서 기존 EAS Android 빌드를 기다린 뒤, 같은 빌드 ID의 산출물과 지도를 검증·보관한다.
# 이미 끝난 빌드는 -BuildId로 다운로드/검사만 다시 할 수 있다.
param(
  [Parameter(Mandatory = $true)][ValidateSet('preview', 'production')][string]$ProfileName,
  [guid]$BuildId
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  if ($BuildId) {
    $json = & eas.cmd build:view $BuildId --json
  } else {
    $json = & eas.cmd build --platform android --profile $ProfileName --wait --non-interactive --json
  }
  if ($LASTEXITCODE -ne 0) { throw 'EAS 명령 실패' }
  $builds = ($json -join "`n") | ConvertFrom-Json
  if (@($builds).Count -ne 1) { throw 'EAS 빌드 하나를 예상했습니다.' }
  $build = @($builds)[0]
  $projectId = node -p "require('./app.config.js').expo.extra.eas.projectId"
  if ($LASTEXITCODE -ne 0 -or !$projectId -or $build.project.id -ne $projectId -or
      $build.platform -ne 'ANDROID' -or $build.buildProfile -ne $ProfileName -or $build.status -ne 'FINISHED') {
    throw "완료된 열공메이트 Android $ProfileName 빌드가 아닙니다."
  }
  $id = [guid]$build.id
  $dist = [IO.Directory]::CreateDirectory((Join-Path $root 'dist')).FullName
  $destination = Join-Path $dist "$ProfileName-$id"
  if (Test-Path -LiteralPath $destination) { throw "이미 보관된 빌드입니다: $destination" }
  $appUrl = $build.artifacts.applicationArchiveUrl
  if (!$appUrl) { $appUrl = $build.artifacts.buildUrl }
  if (!$appUrl -or !$build.artifacts.buildArtifactsUrl) {
    throw "빌드 $id 의 앱 또는 추가 산출물 URL이 없습니다. eas.json의 buildArtifactPaths를 확인하세요."
  }

  $scratch = [IO.Directory]::CreateDirectory((Join-Path $dist ('.r8-' + [guid]::NewGuid()))).FullName
  try {
    $ready = [IO.Directory]::CreateDirectory((Join-Path $scratch 'verified')).FullName
    $unpacked = [IO.Directory]::CreateDirectory((Join-Path $scratch 'support')).FullName
    $extension = if ($ProfileName -eq 'production') { 'aab' } else { 'apk' }
    $app = Join-Path $ready "yeolgong-$ProfileName.$extension"
    $archive = Join-Path $scratch 'support.tar.gz'
    Write-Host "EAS 빌드 $id 다운로드 및 R8 검사"
    & curl.exe --fail --silent --show-error --location --output $app $appUrl
    if ($LASTEXITCODE -ne 0) { throw '앱 다운로드 실패' }
    & curl.exe --fail --silent --show-error --location --output $archive $build.artifacts.buildArtifactsUrl
    if ($LASTEXITCODE -ne 0) { throw '추가 산출물 다운로드 실패' }
    & tar.exe -xf $archive -C $unpacked
    if ($LASTEXITCODE -ne 0) { throw '추가 산출물 압축 해제 실패' }
    foreach ($name in 'mapping.txt', 'r8-metadata.dat') {
      $matchesFound = @(Get-ChildItem -LiteralPath $unpacked -Filter $name -Recurse -File)
      if ($matchesFound.Count -ne 1) { throw "추가 산출물에서 $name 파일 하나를 찾지 못했습니다." }
      Move-Item -LiteralPath $matchesFound[0].FullName -Destination $ready
    }
    & "$PSScriptRoot\check-r8.ps1" -Artifact $app -Mapping "$ready\mapping.txt" -Metadata "$ready\r8-metadata.dat"
    if ($LASTEXITCODE -ne 0) { throw "빌드 $id R8 검사 실패" }
    [IO.Directory]::Move($ready, $destination)
    Write-Host "검사 통과: $destination"
  } finally {
    if ((Split-Path -Parent $scratch) -eq $dist -and (Split-Path -Leaf $scratch) -like '.r8-*') {
      Remove-Item -LiteralPath $scratch -Recurse -Force
    }
  }
} finally {
  Pop-Location
}

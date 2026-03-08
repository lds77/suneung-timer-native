# Metro 대신 pre-built 번들을 복사 (Windows cmd/node 크래시 우회)
$argsList = $args
$bundleOutput = ""
$assetsDest = ""
$sourcemapOutput = ""

for ($i = 0; $i -lt $argsList.Count; $i++) {
    switch ($argsList[$i]) {
        "--bundle-output"    { $bundleOutput    = $argsList[$i + 1]; $i++ }
        "--assets-dest"      { $assetsDest      = $argsList[$i + 1]; $i++ }
        "--sourcemap-output" { $sourcemapOutput = $argsList[$i + 1]; $i++ }
    }
}

$projectRoot = $PSScriptRoot
$srcBundle = "$projectRoot\android\app\src\main\assets\index.android.bundle"
$srcRes    = "$projectRoot\android\app\src\main\res"

if ($bundleOutput -and (Test-Path $srcBundle)) {
    Write-Host "Using pre-built bundle (skipping Metro)..."
    New-Item -ItemType Directory -Force -Path (Split-Path $bundleOutput) | Out-Null
    Copy-Item $srcBundle $bundleOutput -Force

    if ($assetsDest) {
        New-Item -ItemType Directory -Force -Path $assetsDest | Out-Null
        if (Test-Path $srcRes) {
            Get-ChildItem $srcRes | Copy-Item -Destination $assetsDest -Recurse -Force
        }
    }
    if ($sourcemapOutput) {
        New-Item -ItemType Directory -Force -Path (Split-Path $sourcemapOutput) | Out-Null
        [System.IO.File]::WriteAllText($sourcemapOutput, '{"version":3,"sources":[],"mappings":"","names":[]}')
        Write-Host "Source map created OK"
    }
    Write-Host "Bundle copied OK"
    exit 0
}

# fallback: 직접 node 실행
& node @argsList
exit $LASTEXITCODE

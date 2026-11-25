$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) {
    $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
}
if (-not (Test-Path $csc)) {
    Write-Warning 'No se encontró csc.exe de .NET Framework; se omite el launcher EXE.'
    exit 0
}

$src = Join-Path $root 'portable\BeamLabLEO.cs'
$outDir = Join-Path $root 'release\portable'
$out = Join-Path $outDir 'BeamLabLEO.exe'
$icon = Join-Path $root 'build\icon.ico'
New-Item -ItemType Directory -Force $outDir | Out-Null

$args = @(
    '/nologo',
    '/target:winexe',
    '/platform:anycpu',
    '/optimize+',
    '/reference:System.dll',
    '/reference:System.Core.dll',
    '/reference:System.Windows.Forms.dll',
    "/out:$out",
    $src
)
if (Test-Path $icon) { $args = @('/win32icon:' + $icon) + $args }

& $csc @args
if ($LASTEXITCODE -ne 0) { throw "csc falló con código $LASTEXITCODE" }
Write-Output "Launcher: $out"

$pkg = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$zip = Join-Path $root ("release\BeamLabLEO-{0}-portable.zip" -f $pkg.version)
Remove-Item $zip -Force -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $outDir '*') -DestinationPath $zip -CompressionLevel Optimal
Write-Output "ZIP: $zip"

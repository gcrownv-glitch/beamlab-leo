# BeamLab LEO · actualizador portable
#
# Este script NO instala nada y NO borra versiones. Descarga el HTML elegido
# desde GitHub Pages/Releases, valida versión/URL, exige SHA-256 obligatorio
# y lo deja junto a este archivo. El usuario puede conservar versiones previas.

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = [System.IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$manifestUrl = 'https://gcrownv-glitch.github.io/beamlab-leo/versions.json'
$semverRegex = '^\d+\.\d+\.\d+(-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?$'
$trustedUrlRegex = '^https://(gcrownv-glitch\.github\.io/beamlab-leo/|github\.com/gcrownv-glitch/beamlab-leo/releases/download/)'
$sha256Regex = '^[0-9a-f]{64}$'

Write-Host ''
Write-Host '  BeamLab LEO · actualizador portable' -ForegroundColor Cyan
Write-Host '  Las versiones anteriores no se borran.' -ForegroundColor DarkGray
Write-Host ''

try {
    $manifest = Invoke-RestMethod -Uri $manifestUrl -UseBasicParsing -TimeoutSec 20
} catch {
    Write-Host "No se pudo consultar $manifestUrl" -ForegroundColor Red
    Write-Host 'Revisa tu conexión o descarga la versión desde GitHub Releases.' -ForegroundColor Yellow
    Read-Host 'Enter para cerrar'
    exit 1
}

$versions = @($manifest.versions)
if ($versions.Count -eq 0) {
    Write-Host 'El manifiesto no contiene versiones.' -ForegroundColor Red
    Read-Host 'Enter para cerrar'
    exit 1
}

for ($i = 0; $i -lt $versions.Count; $i++) {
    $v = $versions[$i]
    $date = if ($v.date) { $v.date } else { '' }
    $size = if ($v.size) { ('{0:N2} MB' -f ($v.size / 1MB)) } else { '' }
    Write-Host ("  [{0}] {1}  {2}  {3}" -f ($i + 1), $v.version, $date, $size)
}
Write-Host ''
$pick = Read-Host 'Elige una versión (Enter para cancelar)'
if ([string]::IsNullOrWhiteSpace($pick)) { exit 0 }
$index = 0
if (-not [int]::TryParse($pick, [ref]$index) -or $index -lt 1 -or $index -gt $versions.Count) {
    Write-Host 'Opción inválida.' -ForegroundColor Red
    Read-Host 'Enter para cerrar'
    exit 1
}

$selected = $versions[$index - 1]
$verStr = ([string]$selected.version).Trim()
if ($verStr -notmatch $semverRegex) {
    Write-Host "Versión inválida en el manifiesto: '$verStr'" -ForegroundColor Red
    Read-Host 'Enter para cerrar'
    exit 1
}

$downloadUrl = ([string]$selected.html).Trim()
if ($downloadUrl -notmatch $trustedUrlRegex) {
    Write-Host "URL de descarga no confiable: '$downloadUrl'" -ForegroundColor Red
    Read-Host 'Enter para cerrar'
    exit 1
}

$expected = ([string]$selected.sha256).Trim().ToLowerInvariant()
if ($expected -notmatch $sha256Regex) {
    Write-Host 'El manifiesto no incluye un SHA-256 válido de 64 caracteres. Descarga abortada (fail-closed).' -ForegroundColor Red
    Read-Host 'Enter para cerrar'
    exit 1
}

$dest = [System.IO.Path]::GetFullPath((Join-Path $root ("BeamLabLEO-{0}.html" -f $verStr)))
if (-not $dest.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-Host 'Ruta de destino fuera de la carpeta portable.' -ForegroundColor Red
    Read-Host 'Enter para cerrar'
    exit 1
}
$tmp = "$dest.tmp"

if (Test-Path $dest) {
    Write-Host "Ya existe $dest" -ForegroundColor Yellow
    $open = Read-Host '¿Abrir esa versión local? (s/N)'
    if ($open -eq 's' -or $open -eq 'S') { Start-Process $dest }
    exit 0
}

Write-Host ("Descargando {0}…" -f $verStr) -ForegroundColor Cyan
try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $tmp -UseBasicParsing -TimeoutSec 120
} catch {
    Write-Host 'Falló la descarga.' -ForegroundColor Red
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    Read-Host 'Enter para cerrar'
    exit 1
}

$hash = (Get-FileHash -Path $tmp -Algorithm SHA256).Hash.ToLowerInvariant()
if ($hash -ne $expected) {
    Write-Host 'El SHA-256 no coincide. Se descarta la descarga.' -ForegroundColor Red
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    Read-Host 'Enter para cerrar'
    exit 1
}

Move-Item -Path $tmp -Destination $dest -Force
Write-Host ("Guardado en {0}" -f $dest) -ForegroundColor Green
Start-Process $dest

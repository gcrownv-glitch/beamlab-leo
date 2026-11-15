# BeamLab LEO · actualizador portable
#
# Este script NO instala nada y NO borra versiones. Descarga el HTML elegido
# desde GitHub Pages, verifica su SHA-256 y lo deja junto a este archivo.
# El usuario puede conservar cualquier versión anterior.

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifestUrl = 'https://gcrownv-glitch.github.io/beamlab-leo/versions.json'

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
$dest = Join-Path $root ("BeamLabLEO-{0}.html" -f $selected.version)
$tmp = "$dest.tmp"

if (Test-Path $dest) {
    Write-Host "Ya existe $dest" -ForegroundColor Yellow
    $open = Read-Host '¿Abrir esa versión local? (s/N)'
    if ($open -eq 's' -or $open -eq 'S') { Start-Process $dest }
    exit 0
}

Write-Host ("Descargando {0}…" -f $selected.version) -ForegroundColor Cyan
try {
    Invoke-WebRequest -Uri $selected.html -OutFile $tmp -UseBasicParsing -TimeoutSec 120
} catch {
    Write-Host 'Falló la descarga.' -ForegroundColor Red
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    Read-Host 'Enter para cerrar'
    exit 1
}

$hash = (Get-FileHash -Path $tmp -Algorithm SHA256).Hash.ToLowerInvariant()
$expected = ([string]$selected.sha256).ToLowerInvariant()
if ($expected -and $hash -ne $expected) {
    Write-Host 'El SHA-256 no coincide. Se descarta la descarga.' -ForegroundColor Red
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    Read-Host 'Enter para cerrar'
    exit 1
}

Move-Item -Path $tmp -Destination $dest -Force
Write-Host ("Guardado en {0}" -f $dest) -ForegroundColor Green
Start-Process $dest

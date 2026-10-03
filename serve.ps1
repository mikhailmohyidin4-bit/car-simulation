# Tiny static web server for Supercar Dash Sim.
# Uses only what ships with Windows (PowerShell + .NET HttpListener):
# no Python, Node or XAMPP needed. Started by START.bat.
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$rootPrefix = $root.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar

$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'application/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'
  '.wav' = 'audio/wav'; '.mp3' = 'audio/mpeg'; '.ogg' = 'audio/ogg'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'
  '.md' = 'text/plain; charset=utf-8'
}

# first free port from 8000
$listener = $null
foreach ($p in 8000..8020) {
  try {
    $l = New-Object System.Net.HttpListener
    $l.Prefixes.Add("http://localhost:$p/")
    $l.Start()
    $listener = $l; $port = $p; break
  } catch { }
}
if (-not $listener) { Write-Host 'Could not open a port between 8000 and 8020.'; Read-Host 'Press Enter to exit'; exit 1 }

$url = "http://localhost:$port/"
Write-Host ''
Write-Host "  Supercar Dash Sim is running at $url" -ForegroundColor Green
Write-Host '  Close this window to stop it.'
Write-Host ''
if ($env:CARSIM_NO_BROWSER -ne '1') { Start-Process $url }

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $res = $ctx.Response
  try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($path.EndsWith('/')) { $path += 'index.html' }
    $rel = $path.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
    $file = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($root, $rel))
    if (-not $file.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase) -or -not [System.IO.File]::Exists($file)) {
      $res.StatusCode = 404
      $bytes = [Text.Encoding]::UTF8.GetBytes('Not found')
    } else {
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] } else { $res.ContentType = 'application/octet-stream' }
      $res.AddHeader('Cache-Control', 'no-cache')
      $bytes = [System.IO.File]::ReadAllBytes($file)
    }
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {
    try { $res.StatusCode = 500 } catch { }
  } finally {
    try { $res.OutputStream.Close() } catch { }
  }
}

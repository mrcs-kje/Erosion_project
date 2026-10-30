# Tiny local web server for previewing the site (no Python/Node needed).
# Run:  powershell -ExecutionPolicy Bypass -File tools\serve.ps1
# Then open http://localhost:8080
param([int]$Port = 8080)
$root = Join-Path $PSScriptRoot '..\site' | Resolve-Path
$types = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css'; '.js'='text/javascript'; '.svg'='image/svg+xml'
            '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.pdf'='application/pdf'; '.ico'='image/x-icon'; '.woff2'='font/woff2'; '.webp'='image/webp' }
$l = [System.Net.HttpListener]::new(); $l.Prefixes.Add("http://localhost:$Port/"); $l.Start()
Write-Host "Serving $root at http://localhost:$Port"
while ($l.IsListening) {
  $ctx = $l.GetContext(); $res = $ctx.Response
  $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/')); if (-not $path) { $path = 'index.html' }
  $file = Join-Path $root $path
  if ((Test-Path $file -PathType Container)) { $file = Join-Path $file 'index.html' }
  if ((Test-Path $file -PathType Leaf) -and ([IO.Path]::GetFullPath($file)).StartsWith($root.Path)) {
    $bytes = [IO.File]::ReadAllBytes($file)
    $res.ContentType = $types[[IO.Path]::GetExtension($file).ToLower()]; if (-not $res.ContentType) { $res.ContentType = 'application/octet-stream' }
    $res.Headers.Add('Cache-Control', 'no-store')
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    # missing page → show the site's own 404 page, like GitHub Pages / Netlify do
    $res.StatusCode = 404; $res.ContentType = 'text/html; charset=utf-8'
    $nf = Join-Path $root '404.html'; if (Test-Path $nf) { $bytes = [IO.File]::ReadAllBytes($nf); $res.OutputStream.Write($bytes, 0, $bytes.Length) }
  }
  $res.Close()
}

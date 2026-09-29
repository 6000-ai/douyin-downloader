# 打印当前公网分享链接（从 tunnel 日志提取）
$log = Join-Path $PSScriptRoot 'bin\tunnel-live.log'
if (-not (Test-Path $log)) { $log = Join-Path $PSScriptRoot 'bin\tunnel.log' }
if (Test-Path $log) {
  $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -Last 1
  if ($m) {
    $url = [regex]::Match($m.Line, 'https://[a-z0-9-]+\.trycloudflare\.com').Value
    Write-Host "PUBLIC URL: $url"
    Set-Clipboard -Value $url
    Write-Host "(copied to clipboard)"
  } else {
    Write-Host "未在日志中找到公网 URL，请先运行 start-public.bat"
  }
} else {
  Write-Host "未找到隧道日志，请先运行 start-public.bat"
}

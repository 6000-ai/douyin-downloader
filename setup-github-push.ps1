# 一键：创建 GitHub 仓库并推送（需先 gh auth login）
param(
  [string]$RepoName = "douyin-downloader",
  [string]$Visibility = "public"
)
$gh = "C:\Program Files\GitHub CLI\gh.exe"
Set-Location $PSScriptRoot

& $gh auth status
if ($LASTEXITCODE -ne 0) {
  Write-Host "请先登录 GitHub："
  Write-Host "  & 'C:\Program Files\GitHub CLI\gh.exe' auth login"
  exit 1
}

$owner = (& $gh api user --jq .login).Trim()
$full = "$owner/$RepoName"
Write-Host "Creating repo $full ($Visibility)..."

$exists = & $gh repo view $full --json name 2>$null
if (-not $exists) {
  if ($Visibility -eq "public") {
    & $gh repo create $RepoName --public --source=. --remote=origin --push
  } else {
    & $gh repo create $RepoName --private --source=. --remote=origin --push
  }
} else {
  Write-Host "Repo exists, pushing..."
  git remote remove origin 2>$null
  git remote add origin "https://github.com/$full.git"
  git push -u origin main
}

Write-Host ""
Write-Host "完成。接下来去 Render 部署："
Write-Host "  1. 打开 https://dashboard.render.com/new/web-service"
Write-Host "  2. Connect GitHub -> 选择 $RepoName"
Write-Host "  3. Runtime 选 Docker，Deploy"
Write-Host "  4. 环境变量 PORT=8787（render.yaml 已含）"
Write-Host "固定地址形式：https://$RepoName.onrender.com"

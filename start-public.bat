@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo ============================================
echo   Douyin DL - Public Share
echo ============================================

echo [1/3] Starting local server ...
taskkill /F /FI "WINDOWTITLE eq douyin-server*" >nul 2>&1
start "douyin-server" /min cmd /c "node server\index.js"
timeout /t 2 /nobreak >nul

echo [2/3] Starting Cloudflare tunnel (auto-restart) ...
taskkill /F /IM cloudflared.exe >nul 2>&1

:loop
echo [%date% %time%] tunnel starting ...
bin\cloudflared.exe tunnel --url http://127.0.0.1:8787 --no-autoupdate > tunnel-live.log 2>&1
echo [%date% %time%] tunnel exited, restarting in 3s ...
timeout /t 3 /nobreak >nul
goto loop

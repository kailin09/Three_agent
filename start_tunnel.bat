@echo off
chcp 65001 >nul
echo [1/3] 启动后端...
start "backend" cmd /k "cd /d %~dp0backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000"
timeout /t 3 /nobreak >nul
echo [2/3] 启动前端...
start "frontend" cmd /k "cd /d %~dp0frontend && npx vite --host --port 5173"
timeout /t 5 /nobreak >nul
echo [3/3] 启动 Cloudflare Tunnel...
start "tunnel" cmd /k "cd /d %~dp0 && cloudflared.exe tunnel --url http://127.0.0.1:5173"
echo.
echo 全部启动完成！等 tunnel 窗口出现 trycloudflare.com 链接后，发给朋友即可。
pause
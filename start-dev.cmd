@echo off
setlocal

cd /d "%~dp0"
start "CRMDN" /min "C:\Program Files\nodejs\node.exe" scripts\dev.js

endlocal

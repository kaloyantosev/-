@echo off
title IRIS Pay - Подпис на документи (Локален Сървър)
cd /d "%~dp0"
echo ========================================================
echo   IRIS Pay - Локален Сървър за Подпис на Документи
echo ========================================================
echo.
echo Сайтът се зарежда на адрес: http://localhost:8080
echo.
start http://localhost:8080
python -m http.server 8080
pause

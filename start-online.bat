@echo off
title FuelTracks IMS - Permanent Online Launcher
echo ========================================================
echo   FuelTracks Inventory Management System (Online Mode)
echo ========================================================
echo.
echo Your Permanent URL: https://plant-disposal-accompany.ngrok-free.dev
echo.
echo Starting local services and permanent tunnel...
echo.
start "FuelTracks App" cmd /c "npm run dev"
timeout /t 6 >nul
npm run online
pause

@echo off
title Gestion de stock - serveur
REM Demarre le point d'acces puis le serveur.
REM Pensez a demarrer MySQL dans XAMPP avant de lancer ce fichier.
cd /d "%~dp0.."

echo Allumage du point d'acces...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0demarrer-point-acces.ps1"

echo.
echo Demarrage du serveur (ne fermez pas cette fenetre)...
echo.
node src\server.js
echo.
echo Le serveur s'est arrete.
pause
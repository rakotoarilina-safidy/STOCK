@echo off
REM ------------------------------------------------------------------
REM  Autorise les autres PC du magasin a se connecter au serveur
REM  (port 3000). Seuls les appareils du reseau local sont autorises.
REM  A lancer UNE SEULE FOIS sur le PC principal :
REM  clic droit sur ce fichier, puis "Executer en tant qu'administrateur".
REM ------------------------------------------------------------------

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo Ce script doit etre lance en tant qu'administrateur.
  echo Clic droit sur le fichier, puis "Executer en tant qu'administrateur".
  echo.
  pause
  exit /b 1
)

netsh advfirewall firewall delete rule name="Gestion Stock (port 3000)" >nul 2>&1
netsh advfirewall firewall add rule name="Gestion Stock (port 3000)" dir=in action=allow protocol=TCP localport=3000 profile=any remoteip=localsubnet

if %errorlevel% equ 0 (
  echo.
  echo Regle ajoutee : le port 3000 est ouvert pour le reseau local.
) else (
  echo.
  echo Echec de l'ajout de la regle.
)
echo.
pause
@echo off
chcp 65001 >nul
title BeamLab LEO · actualizador portable
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Actualizar.ps1"

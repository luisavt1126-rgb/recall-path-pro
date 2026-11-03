@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Residuum - versao local

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js nao esta instalado.
  echo Instale a versao LTS em https://nodejs.org e rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo.
  echo Criei o arquivo .env. Abra ele no Bloco de Notas, cole o endereco e a
  echo chave do seu projeto Supabase de testes, salve e rode este arquivo de novo.
  echo.
  notepad ".env"
  pause
  exit /b 0
)

if not exist "node_modules" (
  echo Instalando dependencias (so na primeira vez, pode levar alguns minutos)...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo A instalacao falhou. Veja a mensagem acima.
    pause
    exit /b 1
  )
)

echo.
echo Abrindo o Residuum local em http://localhost:5173
echo Para fechar, feche esta janela.
echo.
start "" "http://localhost:5173"
call npm run dev:local
pause

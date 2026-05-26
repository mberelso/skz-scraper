oka@echo off
title SKZ-Scraper Dev Server
cd /d "%~dp0"
echo Starting SKZ-Scraper...
start http://localhost:3000
npm run dev

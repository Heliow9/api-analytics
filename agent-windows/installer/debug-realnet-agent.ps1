$TaskName = "RealNet Monitor Agent"
Write-Host "=== API ==="
try { curl.exe https://dashrealapi.duckdns.org/api/health } catch { Write-Host $_.Exception.Message }
Write-Host "`n=== Tarefa ==="
Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Format-List *
Write-Host "`n=== Config ==="
Get-Content "C:\ProgramData\RealNetAgent\.env" -ErrorAction SilentlyContinue
Write-Host "`n=== Log ==="
Get-Content "C:\ProgramData\RealNetAgent\agent.log" -Tail 80 -ErrorAction SilentlyContinue
Write-Host "`n=== Teste manual 25s ==="
& "C:\Program Files\RealNetAgent\node.exe" "C:\Program Files\RealNetAgent\app\src\index.js"

' GoFlix — double-click to start in the background (no console window) and
' open your browser once it's ready. First run installs dependencies if
' node_modules is missing (requires Node.js).
Option Explicit
Dim shell, fso, scriptDir, lockFile, probe, isRunning
Dim attempt, maxAttempts

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
lockFile = shell.ExpandEnvironmentStrings("%TEMP%\goflix-running.lock")
shell.CurrentDirectory = scriptDir

' Already running? Just open the browser.
Set probe = shell.Exec("cmd /c netstat -ano | findstr /R /C:"":5173 .*LISTENING""")
Do While probe.Status = 0
  WScript.Sleep 50
Loop
isRunning = (Len(Trim(probe.StdOut.ReadAll())) > 0)

If isRunning Then
  shell.Run "http://localhost:5173/", 1, False
  WScript.Quit 0
End If

If Not fso.FolderExists(scriptDir & "\node_modules") Then
  shell.Run "cmd /c npm install", 1, True
End If

Dim f
Set f = fso.CreateTextFile(lockFile, True)
f.Close

shell.Run "cmd /c npm run dev", 0, False

' Poll for the web dev server to come up, then open the browser.
maxAttempts = 120
For attempt = 1 To maxAttempts
  WScript.Sleep 1000
  Set probe = shell.Exec("cmd /c netstat -ano | findstr /R /C:"":5173 .*LISTENING""")
  Do While probe.Status = 0
    WScript.Sleep 50
  Loop
  If Len(Trim(probe.StdOut.ReadAll())) > 0 Then
    shell.Run "http://localhost:5173/", 1, False
    Exit For
  End If
Next

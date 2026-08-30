' GoFlix — double-click to stop (kills processes on ports 5173 & 3001)
Option Explicit
Dim shell, fso, ports, p, line, parts, pid, killed
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

ports = Array(5173, 3001)
killed = 0

For Each p In ports
  Dim exe, out, lines, i
  Set exe = shell.Exec("cmd /c netstat -ano | findstr /R /C:"":" & p & " .*LISTENING""")
  Do While exe.Status = 0
    WScript.Sleep 50
  Loop
  out = exe.StdOut.ReadAll()
  If Len(Trim(out)) > 0 Then
    lines = Split(out, vbCrLf)
    For i = 0 To UBound(lines)
      line = Trim(lines(i))
      If Len(line) > 0 Then
        Do While InStr(line, "  ") > 0
          line = Replace(line, "  ", " ")
        Loop
        parts = Split(line, " ")
        pid = parts(UBound(parts))
        If IsNumeric(pid) Then
          shell.Run "taskkill /F /PID " & pid, 0, True
          killed = killed + 1
        End If
      End If
    Next
  End If
Next

On Error Resume Next
fso.DeleteFile shell.ExpandEnvironmentStrings("%TEMP%\goflix-running.lock"), True
On Error GoTo 0

If killed > 0 Then
  MsgBox "GoFlix stopped.", vbInformation, "GoFlix"
Else
  MsgBox "GoFlix did not appear to be running.", vbInformation, "GoFlix"
End If

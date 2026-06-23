Dim oShell, oFSO, porta, url, tentativas, resposta

Set oShell = CreateObject("WScript.Shell")
Set oFSO = CreateObject("Scripting.FileSystemObject")

porta = 3001
url = "http://localhost:3001/vendas/amazon"

' Verifica se o servidor ja esta rodando na porta 3001
Function ServidorRodando()
    Dim oHTTP
    On Error Resume Next
    Set oHTTP = CreateObject("MSXML2.XMLHTTP")
    oHTTP.Open "GET", "http://localhost:3001", False
    oHTTP.Send
    If Err.Number = 0 And oHTTP.Status > 0 Then
        ServidorRodando = True
    Else
        ServidorRodando = False
    End If
    On Error GoTo 0
End Function

' Se servidor ja esta rodando, abre o browser direto
If ServidorRodando() Then
    oShell.Run "cmd /c start " & url, 0, False
    WScript.Quit
End If

' Inicia o servidor em background (janela oculta)
oShell.Run "cmd /c cd /d ""C:\Users\fabio\Documents\Claude\Mentoria\importos"" && npm run dev", 0, False

' Aguarda o servidor subir (tenta ate 30 vezes com 2s de intervalo = 60s max)
tentativas = 0
Do While tentativas < 30
    WScript.Sleep 2000
    tentativas = tentativas + 1
    If ServidorRodando() Then
        Exit Do
    End If
Loop

' Abre o browser
oShell.Run "cmd /c start " & url, 0, False

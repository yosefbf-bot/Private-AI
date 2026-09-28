!macro customUnInstall
  ReadRegStr $0 HKCU "Software\Google\Chrome\NativeMessagingHosts\org.privateai.companion" ""
  ReadRegStr $1 HKCU "Software\PrivateAI" "RegisteredExecutable"
  ${If} $1 == "$INSTDIR\PrivateAI.exe"
    DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\org.privateai.companion"
    DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\org.privateai.companion"
    DeleteRegKey HKCU "Software\Mozilla\NativeMessagingHosts\org.privateai.companion"
    DeleteRegKey HKCU "Software\PrivateAI"
  ${EndIf}
  ; Start-at-sign-in can be enabled without ever connecting Chrome.
  ; Remove only an entry pointing to this installation, not a portable copy.
  ReadRegStr $2 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Private AI"
  ${If} $2 == '"$INSTDIR\PrivateAI.exe" --background'
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Private AI"
  ${ElseIf} $2 == '"$INSTDIR\PrivateAI.exe"'
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Private AI"
  ${EndIf}
!macroend

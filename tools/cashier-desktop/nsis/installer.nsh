; Default install folder: C:\BingChunCashier
; Assisted installer shows Desktop shortcut checkbox when createDesktopShortcut=true.
!macro preInit
  SetRegView 64
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\BingChunCashier"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\BingChunCashier"
!macroend

; Default install folder: C:\BingChunCashier
; Assisted installer shows Desktop shortcut checkbox when createDesktopShortcut=true.
; Win7 32-bit cashiers need SetRegView 32 — SetRegView 64 breaks on pure ia32 OS.
!include "LogicLib.nsh"
!include "x64.nsh"

!macro preInit
  ${If} ${RunningX64}
    SetRegView 64
  ${Else}
    SetRegView 32
  ${EndIf}
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\BingChunCashier"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\BingChunCashier"
!macroend

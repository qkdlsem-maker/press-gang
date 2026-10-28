!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.jpg\shell\PressGang"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.jpeg\shell\PressGang"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.png\shell\PressGang"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.webp\shell\PressGang"
!macroend

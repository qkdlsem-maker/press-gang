# Install Press Gang 2.0.1-beta.1

[한국어](INSTALL.ko.md)

## Download and install

Tested on Windows 11 x64. macOS, Linux and native Windows ARM64 installers are not provided. Windows 10 has not been verified for this beta.

Download `PressGang-Setup-2.0.1-beta.1-x64.exe` from [this release](https://github.com/qkdlsem-maker/press-gang/releases/tag/v2.0.1-beta.1). Pick English or Korean in the installer. The per-user installer does not need administrator rights. The installed-app name may appear as **압축깡패**; the executable is `PressGang.exe`.

The installer is unsigned. Windows may show an unknown-publisher or reputation warning. Do not turn off security protections. If unsure about a warning, stop and report what it says with private details removed.

To verify the download, run this in PowerShell from its folder and compare with the release's `SHA256SUMS.txt`:

```powershell
Get-FileHash -Algorithm SHA256 .\PressGang-Setup-2.0.1-beta.1-x64.exe
```

A match confirms the file is identical to the published release; it is not a code-signing certificate.

## First use and language

Launch the app, select **English** in the header and add a still JPG/PNG/WebP. Choose a limit, compress, compare, then copy or save. Language is remembered across launches. Switching languages preserves the queue and results; the selector is disabled during a job.

**Quick tools → Explorer context menu** is optional and off by default. It registers only for your Windows user. In Windows 11, use **Show more options**. Turning it off removes this app's menu. English mode uses English menu labels; changing the app language updates an enabled menu.

## Where are my files?

- **Save result** asks for a folder and writes a new file.
- **Copy file**, dragging a result out and Explorer quick compression keep results in **Downloads → 압축깡패**. That folder is shared by both languages.
- English result names use `-compressed`; Korean names use `-압축`. Existing files are never overwritten; a number is added when needed.
- Automatic mode may return an already-small original with its format and metadata unchanged.
- Clearing the queue does not remove saved files. Normal exit removes unsaved session copies; a crash can leave copies in the Windows temporary folder.

## Update or uninstall

There is no automatic updater. Save results you want to keep, close Press Gang, then run the newer official installer. It uses the same per-user location as 2.0.0 unless you choose another location. Unsaved session results do not survive a restart.

Uninstall through **Windows Settings → Apps → Installed apps → 압축깡패**. Uninstall removes the app's Explorer menu. Exported images remain in their folders, and preferences may remain in the app's user-data folder. Remove those yourself only if no longer needed.

## Report a problem

Use the [English or Korean issue form](https://github.com/qkdlsem-maker/press-gang/issues/new/choose). For pasting problems, name the destination app and say whether directly attaching the saved file works. Original images are optional. Do not share private photos, passwords or personal paths.

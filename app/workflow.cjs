const path = require('node:path');
const { spawn } = require('node:child_process');

const menuRoot = 'Software\\Classes\\SystemFileAssociations';
const extensions = ['.jpg', '.jpeg', '.png', '.webp'];
function parseQuickArgs(args) {
  const q = args.indexOf('--quick'), f = args.indexOf('--image');
  if (q < 0 || f < 0) return null;
  const targetBytes = Number(args[q + 1]), file = args[f + 1];
  if (![500000, 1000000].includes(targetBytes) || typeof file !== 'string' || !path.win32.isAbsolute(file) || !extensions.includes(path.extname(file).toLowerCase())) return null;
  return { targetBytes, file };
}
// Only fixed scripts execute. User-controlled filenames travel as JSON on stdin.
function powershell(script, data = {}) {
  return new Promise((resolve, reject) => {
    const preamble = "$ErrorActionPreference='Stop'; [Console]::InputEncoding=[Text.UTF8Encoding]::new(); [Console]::OutputEncoding=[Text.UTF8Encoding]::new(); $request=[Console]::In.ReadToEnd() | ConvertFrom-Json; ";
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', Buffer.from(preamble + script, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Windows 응답이 늦습니다. 잠시 후 다시 시도해주세요.')); }, 12000);
    child.stdout.on('data', b => { stdout += b.toString('utf8'); });
    child.stderr.on('data', b => { stderr += b.toString('utf8'); });
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => { clearTimeout(timer); if (code) reject(new Error('Windows 작업을 완료하지 못했습니다. 다른 앱이 클립보드를 사용 중이면 다시 시도해주세요.')); else { try { resolve(stdout.trim() ? JSON.parse(stdout.trim()) : true); } catch { reject(new Error('Windows 응답을 읽지 못했습니다.')); } } });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(data));
  });
}
const readFilesScript = `Add-Type -AssemblyName System.Windows.Forms; $files=@([Windows.Forms.Clipboard]::GetFileDropList()); ConvertTo-Json -InputObject $files -Compress`;
const copyFilesScript = `Add-Type -AssemblyName System.Windows.Forms; $files=[Collections.Specialized.StringCollection]::new(); foreach($file in $request.paths){if(!(Test-Path -LiteralPath $file -PathType Leaf)){throw 'Missing result'}; [void]$files.Add($file)}; [Windows.Forms.Clipboard]::SetFileDropList($files); ConvertTo-Json -InputObject $true`;
const registryScript = `
$roots=@('.jpg','.jpeg','.png','.webp') | ForEach-Object { 'Software\\Classes\\SystemFileAssociations\\' + $_ + '\\shell\\PressGang' };
if($request.action -eq 'status') {
  $enabled=$true; foreach($root in $roots){$key=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($root+'\\shell\\01\\command'); if(!$key){$enabled=$false}else{if($key.GetValue('') -ne ('"'+$request.executable+'" --quick 500000 --image "%1"')){$enabled=$false}; $key.Dispose()}};
  ConvertTo-Json -InputObject $enabled; exit
};
foreach($root in $roots){
  if($request.action -eq 'disable'){[Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree($root,$false); continue};
  $key=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($root); $key.SetValue('MUIVerb',$request.title); $key.SetValue('ExtendedSubCommandsKey',$root.Substring('Software\\Classes\\'.Length)); $key.SetValue('Icon',$request.executable); $key.SetValue('MultiSelectModel','Single'); $key.Dispose();
  foreach($preset in @(@('01',$request.small,500000),@('02',$request.large,1000000))){
    $key=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($root+'\\shell\\'+$preset[0]); $key.SetValue('MUIVerb',$preset[1]); $key.SetValue('MultiSelectModel','Single'); $key.Dispose();
    $key=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($root+'\\shell\\'+$preset[0]+'\\command'); $key.SetValue('',('"'+$request.executable+'" --quick '+$preset[2]+' --image "%1"')); $key.Dispose()
  }
}; ConvertTo-Json -InputObject $true`;
exports.parseQuickArgs = parseQuickArgs;
exports.readClipboardFiles = () => powershell(readFilesScript);
exports.copyFiles = paths => { if (!Array.isArray(paths) || !paths.length || paths.length > 12 || paths.some(p => !path.isAbsolute(p))) throw new Error('복사할 파일이 올바르지 않습니다.'); return powershell(copyFilesScript, { paths }); };
exports.integration = (action, executable, language = 'ko') => { if (!['status','enable','disable'].includes(action) || !path.isAbsolute(executable) || executable.includes('"')) throw new Error('올바르지 않은 설정입니다.'); return powershell(registryScript, { action, executable, title: language === 'en' ? 'Press Gang' : '압축깡패', small: language === 'en' ? 'Compress to 500 KB' : '500KB 이하로 압축', large: language === 'en' ? 'Compress to 1 MB' : '1MB 이하로 압축' }); };
exports.powershell = powershell;

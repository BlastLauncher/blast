// Clipboard data travels as JSON, never as executable script source.
export const macCopy = `ObjC.import('AppKit');
function run(argv) {
  const p = JSON.parse(argv[0]), b = $.NSPasteboard.generalPasteboard;
  b.clearContents;
  if (p.text !== undefined) b.setStringForType(p.text, 'public.utf8-plain-text');
  if (p.html !== undefined) b.setStringForType(p.html, 'public.html');
  if (p.file !== undefined) b.writeObjects([$.NSURL.fileURLWithPath(p.file)]);
}`;
export const macRead = `ObjC.import('AppKit');
function run() {
  const b = $.NSPasteboard.generalPasteboard, p = {text: ''};
  for (const [key, type] of [['text', 'public.utf8-plain-text'], ['html', 'public.html'], ['file', 'public.file-url']]) {
    const v = b.stringForType(type);
    if (v.isNil()) continue;
    p[key] = key === 'file' ? ObjC.unwrap($.NSURL.URLWithString(v).path) : ObjC.unwrap(v);
  }
  return JSON.stringify(p);
}`;
export const macTrash = `function run(argv) { Application('Finder').delete(argv.map(p => Path(p))); }`;
export const psPrefix =
  "$ErrorActionPreference='Stop'; [Console]::InputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); ";
export const psInput = "$p=([Console]::In.ReadToEnd() | ConvertFrom-Json); ";
export const psCopy =
  psInput +
  "if ($null -ne $p.file) { Set-Clipboard -LiteralPath $p.file } elseif ($null -ne $p.html) { Set-Clipboard -Value $p.html -AsHtml; if ($null -ne $p.text) { Add-Type -AssemblyName System.Windows.Forms; $d=New-Object Windows.Forms.DataObject; $d.SetData('HTML Format', [Windows.Forms.Clipboard]::GetData('HTML Format')); $d.SetData('UnicodeText', $p.text); [Windows.Forms.Clipboard]::SetDataObject($d, $true) } } else { Set-Clipboard -Value $p.text }";
export const psRead =
  "Add-Type -AssemblyName System.Windows.Forms; $p=@{text=[string](Get-Clipboard -Raw)}; if ([Windows.Forms.Clipboard]::ContainsText([Windows.Forms.TextDataFormat]::Html)) { $p.html=[string](Get-Clipboard -TextFormatType Html -Raw) }; if ([Windows.Forms.Clipboard]::ContainsFileDropList()) { $p.file=[string](@(Get-Clipboard -Format FileDropList)[0].FullName) }; ConvertTo-Json -Compress -InputObject $p";
export const psOpen =
  psInput +
  "if ($p.application) { Start-Process -FilePath $p.application -ArgumentList $p.argument } else { Start-Process -FilePath $p.target }";
export const psTrash =
  psInput +
  "Add-Type -AssemblyName Microsoft.VisualBasic; foreach ($path in $p.paths) { if ([IO.Directory]::Exists($path)) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($path, 'OnlyErrorDialogs', 'SendToRecycleBin') } else { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($path, 'OnlyErrorDialogs', 'SendToRecycleBin') } }";

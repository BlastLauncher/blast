// Fixed scripts only. Caller-controlled values arrive in argv or JSON stdin.
export const macApplications = `ObjC.import('AppKit');
function run(argv) {
  const op = argv[0], p = JSON.parse(argv[1]), ws = $.NSWorkspace.sharedWorkspace;
  function app(url) {
    if (!url || url.isNil()) throw Error('No application found');
    const b = $.NSBundle.bundleWithURL(url), path = ObjC.unwrap(url.path);
    const id = b.bundleIdentifier;
    const name = $.NSFileManager.defaultManager.displayNameAtPath(path);
    return Object.assign({name: ObjC.unwrap(name), path: path}, id.isNil() ? {} : {bundleId: ObjC.unwrap(id)});
  }
  if (op === 'frontmost') return JSON.stringify(app(ws.frontmostApplication.bundleURL));
  if (p.path !== undefined) {
    const url = $.NSURL.fileURLWithPath(p.path);
    if (op === 'default') return JSON.stringify(app(ws.URLForApplicationToOpenURL(url)));
    const urls = ws.URLsForApplicationsToOpenURL(url), result = [];
    for (let i=0; i<urls.count; i++) result.push(app(urls.objectAtIndex(i)));
    return JSON.stringify(result);
  }
  const result = [], fm = $.NSFileManager.defaultManager;
  for (const root of ['/Applications', '/System/Applications', ObjC.unwrap($.NSHomeDirectory()) + '/Applications']) {
    const e = fm.enumeratorAtPath(root);
    if (e.isNil()) continue;
    let path;
    while (!(path = e.nextObject).isNil()) {
      const relative = ObjC.unwrap(path);
      if (!relative.endsWith('.app')) continue;
      result.push(app($.NSURL.fileURLWithPath(root + '/' + relative)));
      e.skipDescendants;
    }
  }
  return JSON.stringify(result);
}`;

export const psUser32 = `Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class BlastDesktop {
  [ComImport, Guid("F04061AC-1659-4A3F-A954-775AA57FC083"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface Handler {
    [return: MarshalAs(UnmanagedType.LPWStr)] string GetName();
    [return: MarshalAs(UnmanagedType.LPWStr)] string GetUIName();
  }
  [ComImport, Guid("973810AE-9599-4B88-9E4D-6EE98C9552DA"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface Handlers { [PreserveSig] int Next(uint count, out Handler handler, out uint fetched); }
  [DllImport("shell32.dll", CharSet=CharSet.Unicode, PreserveSig=false)]
  public static extern void SHAssocEnumHandlers(string extension, uint filter, out Handlers handlers);
  public static string[][] Associations(string extension) {
    Handlers handlers; SHAssocEnumHandlers(extension, 0, out handlers);
    var result = new System.Collections.Generic.List<string[]>();
    try {
      Handler handler; uint fetched; int status;
      while ((status = handlers.Next(1, out handler, out fetched)) == 0 && fetched == 1) {
        try { result.Add(new string[] {handler.GetUIName(), handler.GetName()}); }
        finally { Marshal.ReleaseComObject(handler); }
      }
      if (status < 0) Marshal.ThrowExceptionForHR(status);
      return result.ToArray();
    } finally { Marshal.ReleaseComObject(handlers); }
  }
  [DllImport("shlwapi.dll", CharSet=CharSet.Unicode)] public static extern uint AssocQueryString(uint flags, uint str, string assoc, string extra, System.Text.StringBuilder output, ref uint length);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr w, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr w, out Rect r);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr w);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr w);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr w, int index);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool SetWindowPos(IntPtr w, IntPtr after, int x, int y, int cx, int cy, uint flags);
  public delegate bool Callback(IntPtr w, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Callback callback, IntPtr p);
  public struct Rect { public int Left, Top, Right, Bottom; }
  [ComImport, Guid("A5CD92FF-29BE-454C-8D04-D82879FB3F1B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface Desktops {
    [return: MarshalAs(UnmanagedType.Bool)] bool IsWindowOnCurrentVirtualDesktop(IntPtr w);
    Guid GetWindowDesktopId(IntPtr w);
    void MoveWindowToDesktop(IntPtr w, ref Guid id);
  }
  public static Desktops Manager() { return (Desktops)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("AA509086-5CA9-4C25-8F95-589D3C07B48A"))); }
}
'@
function ApplicationFor($w) {
  [uint32]$processId=0; [void][BlastDesktop]::GetWindowThreadProcessId($w, [ref]$processId)
  $process=Get-Process -Id $processId -ErrorAction Stop
  if (!$process.Path) { throw 'Application executable path is inaccessible' }
  return @{name=$process.ProcessName; path=$process.Path}
}
`;
export const psApplications =
  psUser32 +
  `
$p=([Console]::In.ReadToEnd() | ConvertFrom-Json)
if ($p.op -eq 'frontmost') { $result=ApplicationFor ([BlastDesktop]::GetForegroundWindow()) }
elseif ($p.op -eq 'default') {
  $length=[uint32]32768; $buffer=New-Object Text.StringBuilder 32768
  $status=[BlastDesktop]::AssocQueryString(0, 2, [IO.Path]::GetExtension($p.path), $null, $buffer, [ref]$length)
  if ($status -ne 0) { throw 'No default application for this path' }
  $path=$buffer.ToString(); $result=@{name=[IO.Path]::GetFileNameWithoutExtension($path); path=$path}
} elseif ($p.path) {
  $result=@([BlastDesktop]::Associations([IO.Path]::GetExtension($p.path)) | ForEach-Object { @{name=$_[0]; path=$_[1]} })
} else {
  $result=@(Get-StartApps | ForEach-Object { @{name=$_.Name; path=('shell:AppsFolder\\'+$_.AppID); windowsAppId=$_.AppID} })
}
ConvertTo-Json -Depth 8 -Compress -InputObject $result`;

export const macSelectedText = `ObjC.import('AppKit');
function run() {
  const b = $.NSPasteboard.generalPasteboard, saved = [];
  const items = b.pasteboardItems;
  for (let i=0; i<items.count; i++) {
    const item = items.objectAtIndex(i), copy = $.NSPasteboardItem.alloc.init;
    const types = item.types;
    for (let j=0; j<types.count; j++) { const type=types.objectAtIndex(j); copy.setDataForType(item.dataForType(type), type); }
    saved.push(copy);
  }
  try {
    b.clearContents;
    const change = b.changeCount;
    Application('System Events').keystroke('c', {using: 'command down'});
    for (let i=0; i<20 && b.changeCount === change; i++) delay(0.05);
    const text = b.stringForType('public.utf8-plain-text');
    return JSON.stringify(text.isNil() ? '' : ObjC.unwrap(text));
  } finally { b.clearContents; if (saved.length) b.writeObjects(saved); }
}`;
export const macSelectedFiles = `ObjC.import('Foundation'); function run() { return JSON.stringify(Application('Finder').selection().map(x => ({path: ObjC.unwrap($.NSURL.URLWithString(x.url()).path)}))); }`;
export const psSelectedText = `Add-Type -AssemblyName System.Windows.Forms
$original=[Windows.Forms.Clipboard]::GetDataObject()
$saved=$null
if ($null -ne $original) {
  $saved=New-Object Windows.Forms.DataObject
  foreach ($format in $original.GetFormats($false)) { $saved.SetData($format, $false, $original.GetData($format, $false)) }
}
try {
  [Windows.Forms.Clipboard]::Clear()
  [Windows.Forms.SendKeys]::SendWait('^c')
  for ($i=0; $i -lt 20 -and ![Windows.Forms.Clipboard]::ContainsText(); $i++) { Start-Sleep -Milliseconds 50 }
  [Console]::Write([Windows.Forms.Clipboard]::GetText())
} finally {
  if ($null -eq $saved) { [Windows.Forms.Clipboard]::Clear() }
  else { [Windows.Forms.Clipboard]::SetDataObject($saved, $true) }
}`;
export const psSelectedFiles =
  psUser32 +
  `
$active=[BlastDesktop]::GetForegroundWindow()
$shell=New-Object -ComObject Shell.Application
$window=@($shell.Windows() | Where-Object { $_.HWND -eq $active.ToInt64() })
if (!$window.Count) { throw 'The frontmost window is not an Explorer folder' }
$result=@($window[0].Document.SelectedItems() | ForEach-Object { if ($_.IsFileSystem) { @{path=$_.Path} } })
ConvertTo-Json -Compress -InputObject $result`;

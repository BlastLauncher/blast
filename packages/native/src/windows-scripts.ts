import { psUser32 } from "./desktop-scripts.ts";
export const psWindows =
  psUser32 +
  `
$p=([Console]::In.ReadToEnd() | ConvertFrom-Json)
$manager=[BlastDesktop]::Manager()
$active=[BlastDesktop]::GetForegroundWindow()
if ($p.op -eq 'setBounds') {
  $w=[IntPtr][long]$p.id
  if (![BlastDesktop]::IsWindow($w)) { throw 'Window no longer exists' }
  $r=New-Object BlastDesktop+Rect
  if (![BlastDesktop]::GetWindowRect($w, [ref]$r)) { throw 'Cannot read window bounds' }
  $x=$r.Left; $y=$r.Top; $width=$r.Right-$r.Left; $height=$r.Bottom-$r.Top
  if ($null -ne $p.bounds.position.x) { $x=$p.bounds.position.x }
  if ($null -ne $p.bounds.position.y) { $y=$p.bounds.position.y }
  if ($null -ne $p.bounds.size.width) { $width=$p.bounds.size.width }
  if ($null -ne $p.bounds.size.height) { $height=$p.bounds.size.height }
  if (![BlastDesktop]::SetWindowPos($w, [IntPtr]::Zero, $x, $y, $width, $height, 20)) { throw 'Cannot set window bounds' }
  if ($p.desktopId) { $id=[Guid]$p.desktopId; $manager.MoveWindowToDesktop($w, [ref]$id) }
  'null'; return
}
$handles=New-Object 'Collections.Generic.List[IntPtr]'
if ($p.op -eq 'active') { $handles.Add($active) }
else { [void][BlastDesktop]::EnumWindows({param($w,$unused) $handles.Add($w); return $true}, [IntPtr]::Zero) }
$result=@(foreach ($w in $handles) {
  if (![BlastDesktop]::IsWindowVisible($w) -or !$manager.IsWindowOnCurrentVirtualDesktop($w)) { continue }
  $r=New-Object BlastDesktop+Rect
  if (![BlastDesktop]::GetWindowRect($w, [ref]$r)) { throw 'Cannot read window bounds' }
  $style=[BlastDesktop]::GetWindowLong($w, -16)
  @{id=[string]$w.ToInt64(); desktopId=[string]$manager.GetWindowDesktopId($w); active=($w -eq $active);
    bounds=@{position=@{x=$r.Left; y=$r.Top}; size=@{width=($r.Right-$r.Left); height=($r.Bottom-$r.Top)}};
    fullScreenSettable=$false; resizable=([bool]($style -band 0x40000)); positionable=([bool]($style -band 0x80000))}
})
if ($p.op -eq 'active') { if (!$result.Count) { throw 'No active window' }; $result=$result[0] }
ConvertTo-Json -Depth 8 -Compress -InputObject $result`;

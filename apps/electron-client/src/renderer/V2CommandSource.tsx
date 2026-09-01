import type { CoreCommandDescriptor } from "@blastlauncher/core";

import { describeV2CommandSource } from "./v2CommandListModel";

export function V2CommandSourceBadge({
  sourceKind,
}: {
  readonly sourceKind: CoreCommandDescriptor["sourceKind"];
}): React.JSX.Element | null {
  const label = describeV2CommandSource(sourceKind);
  if (label === undefined) {
    return null;
  }
  return (
    <span
      className="mt-1 inline-flex rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-white/60"
      data-source-kind={sourceKind}
    >
      {label}
    </span>
  );
}

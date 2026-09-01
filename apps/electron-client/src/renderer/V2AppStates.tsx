export function V2CommandEmptyState({
  disabled,
  onRefresh,
  query,
}: {
  readonly disabled: boolean;
  readonly onRefresh: () => void;
  readonly query: string;
}): React.JSX.Element {
  const hasQuery = query.trim().length > 0;
  return (
    <div className="rounded-lg border border-dashed border-white/10 px-4 py-10 text-center" role="status">
      <div className="text-sm text-white/65">
        {hasQuery ? "No commands match this search." : "No V2 commands are available yet."}
      </div>
      {!hasQuery && (
        <>
          <p className="mt-1 text-xs text-white/40">Add a compatible extension, then refresh the catalog.</p>
          <button
            className="mt-4 rounded-md bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20 disabled:opacity-50"
            disabled={disabled}
            onClick={onRefresh}
            type="button"
          >
            Refresh catalog
          </button>
        </>
      )}
    </div>
  );
}

export function V2StartupFailure({
  disabled,
  onRetry,
}: {
  readonly disabled: boolean;
  readonly onRetry: () => void;
}): React.JSX.Element {
  return (
    <div
      aria-live="polite"
      className="mx-auto flex max-w-xl flex-col items-center rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-8 text-center"
      role="status"
    >
      <div className="text-sm font-medium text-red-100">V2 client is unavailable.</div>
      <p className="mt-1 text-xs text-red-100/70">The local core may still be starting. Try connecting again.</p>
      <button
        className="mt-4 rounded-md bg-red-200/15 px-3 py-1.5 text-xs text-red-50 hover:bg-red-200/25 disabled:opacity-50"
        disabled={disabled}
        onClick={onRetry}
        type="button"
      >
        {disabled ? "Connecting…" : "Retry connection"}
      </button>
    </div>
  );
}

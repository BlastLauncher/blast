/** Default look of the built-in renderer; every colour is a `--blast-*` custom property. */
export const defaultStyles = `
.blast-web{--blast-bg:#fcfcfc;--blast-fg:#171717;--blast-muted:#646464;--blast-line:#e2e2e2;--blast-selection:#ededed;--blast-accent:#ff6338;--blast-error:#d93036;--blast-radius:12px;font:14px/1.4 system-ui,sans-serif;background:var(--blast-bg);color:var(--blast-fg);border:1px solid var(--blast-line);border-radius:var(--blast-radius);overflow:hidden}
.blast-web[data-theme=dark]{--blast-bg:#161616;--blast-fg:#f2f2f2;--blast-muted:#a0a0a0;--blast-line:#343434;--blast-selection:#282828}
@media(prefers-color-scheme:dark){.blast-web:not([data-theme=light]){--blast-bg:#161616;--blast-fg:#f2f2f2;--blast-muted:#a0a0a0;--blast-line:#343434;--blast-selection:#282828}}
.blast-web main{display:flex;flex-direction:column;min-height:16rem}
.blast-web header{padding:.5rem .75rem;border-bottom:1px solid var(--blast-line)}
.blast-web h1{margin:0 0 .25rem;font-size:12px;font-weight:600;color:var(--blast-muted)}
.blast-web .search-line{display:flex;gap:.5rem;align-items:center}
.blast-web input,.blast-web textarea,.blast-web select{font:inherit;color:inherit;background:transparent;border:0;outline:0}
.blast-web #search,.blast-web .search-line input{flex:1;padding:.25rem 0}
.blast-web ul{margin:0;padding:.25rem;list-style:none;flex:1;overflow:auto}
.blast-web li{display:flex;gap:.5rem;align-items:center;padding:.4rem .5rem;border-radius:8px}
.blast-web li.selected,.blast-web .selected{background:var(--blast-selection)}
.blast-web .section-header{color:var(--blast-muted);font-size:12px}
.blast-web small,.blast-web .root-accessory{color:var(--blast-muted)}
.blast-web .root-copy{flex:1;display:flex;gap:.5rem;align-items:baseline}
.blast-web footer{display:flex;gap:.75rem;align-items:center;padding:.4rem .75rem;border-top:1px solid var(--blast-line);color:var(--blast-muted)}
.blast-web footer #status{flex:1}
.blast-web #status[data-error=true],.blast-web [data-blast-error]{color:var(--blast-error)}
.blast-web button{font:inherit;color:inherit;background:transparent;border:0;border-radius:6px;cursor:pointer}
.blast-web kbd{font:inherit;font-size:11px;padding:0 .3rem;margin-left:.25rem;border:1px solid var(--blast-line);border-radius:4px}
.blast-web .actions,.blast-web .dropdown-panel{margin:.5rem;padding:.5rem;border:1px solid var(--blast-line);border-radius:8px;background:var(--blast-bg)}
.blast-web .empty,.blast-web [role=status]:not(#status){padding:1rem;color:var(--blast-muted)}
.blast-web .detail,.blast-web .extension-form{padding:.75rem}
.blast-web .form-field{display:flex;flex-direction:column;gap:.25rem;margin-bottom:.5rem}
.blast-web .visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
`;

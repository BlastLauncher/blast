import cx from "classnames";
import { useRef, useCallback } from "react";
import { create } from "zustand";

import { useRemoteBlastTree } from "../store";

import { Highlight } from "./Highlight";

type DevtoolStore = {
  devtoolOpen: boolean;
  setDevtoolOpen: (open: boolean) => void;
};

export const useDevtoolStore = create<DevtoolStore>()((set) => ({
  devtoolOpen: false,
  setDevtoolOpen: (open) => set({ devtoolOpen: open }),
}));

export const Devtool = () => {
  const { tree, ws } = useRemoteBlastTree();
  const { setDevtoolOpen, devtoolOpen } = useDevtoolStore();

  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const onClick = useCallback(() => {
    const value = inputRef.current?.value;
    const params = textareaRef.current?.value;

    if (!value) {
      return;
    }

    try {
      const parsedParams = JSON.parse(params || "null");

      ws.call(value, parsedParams);
    } catch (e) {
      console.error(e);
    }
  }, [ws]);

  const popAction = useCallback(() => {
    ws.call("blast-global:pop");
  }, [ws]);

  return (
    <>
      <div
        className={cx(
          "fixed top-0 left-0 w-screen h-screen z-10 flex flex-col transition-transform p-1 gap-1 bg-white",
          {
            "translate-y-full": !devtoolOpen,
          }
        )}
      >
        <Highlight className="max-h-[300px] overflow-auto language-json whitespace-pre text-sm">
          {JSON.stringify(tree, null, 2)}
        </Highlight>

        {/* close devtool button */}
        <button
          className="absolute px-2 py-1 text-white rounded-md top-2 right-2 bg-slate-600"
          onClick={() => setDevtoolOpen(false)}
        >
          {/* symbol close */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* devtool form */}
        <div className="flex flex-col flex-1 gap-1">
          <div className="flex flex-1 gap-3">
            <label className="px-2 py-1" htmlFor="action">
              Action
            </label>
            <input className="px-2 py-1" type="text" id="action" ref={inputRef} defaultValue="action:r0:" />
          </div>

          <div className="flex flex-1 gap-3">
            <label className="px-2 py-1" htmlFor="params">
              Params
            </label>
            <textarea
              className="flex-1 px-2 py-1 font-mono"
              id="params"
              ref={textareaRef}
              defaultValue='{"value": "hello world"}'
            />
          </div>

          <div className="flex flex-1 gap-2 mt-2">
            <button className="px-4 text-white rounded-md bg-slate-600" onClick={onClick}>
              Send Action
            </button>

            <button className="px-4 text-white rounded-md bg-slate-600" onClick={popAction}>
              Pop Action
            </button>
          </div>
        </div>
      </div>

      {/* open devtool button */}
      {!devtoolOpen && (
        <button
          className="fixed px-2 py-1 text-white rounded-md top-2 right-2 bg-slate-600"
          onClick={() => setDevtoolOpen(true)}
        >
          {/* symbol open */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-2 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}
    </>
  );
};

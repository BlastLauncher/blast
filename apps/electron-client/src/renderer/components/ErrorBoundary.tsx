import { useEffect } from "react";

import { useNavigationContext } from "./Navigation/context";

export type BoundaryProps = {
  error: string;
  errorStack: string;
};

export const ErrorBoundary = (props: BoundaryProps) => {
  const { pop } = useNavigationContext();

  useEffect(() => {
    function listener(e: KeyboardEvent) {
      if (e.key === "Escape") {
        pop();
      }
    }

    document.addEventListener("keydown", listener);

    return () => {
      document.removeEventListener("keydown", listener);
    };
  }, [pop]);

  return (
    <div className="flex items-center flex-col pt-5 px-4 text-white w-full gap-4">
      <h1 className="text-2xl font-bold">{props.error}</h1>

      <div className="whitespace-pre-wrap font-mono">{props.errorStack}</div>
    </div>
  );
};

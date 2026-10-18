import hljs from "highlight.js";
import { useEffect, useRef } from "react";

type HighlightProps = {
  children: string;
  className?: string;
  language?: string;
};

export const Highlight = ({ children, className }: HighlightProps) => {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      hljs.highlightElement(ref.current);
    }
  }, []);

  return (
    <code ref={ref} className={className}>
      {children}
    </code>
  );
};

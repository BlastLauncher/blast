import fs from "fs";

import _eval from "eval";
import React from "react";

export function evalJSModule(pkg: string) {
  const jsCode = fs.readFileSync(pkg, "utf8");

  const mod = _eval(
    jsCode,
    pkg,
    {
      require,
      _jsx: React.createElement,
    },
    true
  );

  return (mod as any).default;
}

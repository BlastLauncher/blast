import fs from "fs";

import _eval from "eval";
import React from "react";

export function evalCommandModule(pkg: string) {
  const jsCode = fs.readFileSync(pkg, "utf8");

  const mod: any = _eval(
    jsCode,
    pkg,
    {
      require,
      _jsx: React.createElement,
      _jsxFragment: React.Fragment,
    },
    true
  );

  return mod.default;
}

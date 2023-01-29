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

  // Since we bundle the extension module with rollup, so the default namespace export is not available.
  // return mod.default;
  return mod;
}

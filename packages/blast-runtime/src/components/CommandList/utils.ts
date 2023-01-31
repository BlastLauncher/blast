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

  // If we use rollup for bundling, we can use the following:
  // return mod;
  // https://github.com/rollup/rollup/issues/3284
  //
  // Stay mod.default for compatibility with official raycast build, might be changed in the future
  return mod.default;
}

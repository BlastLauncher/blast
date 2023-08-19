import fs from "fs";

import * as blastAPI from "@blastlauncher/api";
import _eval from "eval";
import React from "react";

export function evalCommandModule(pkg: string) {
  const jsCode = fs.readFileSync(pkg, "utf8");

  const customRequire = (id: string) => {
    if (id === "react") {
      return React;
    } else if (id === "@raycast/api") {
      return blastAPI;
    } else {
      return require(id);
    }
  };

  const mod: any = _eval(
    jsCode,
    pkg,
    {
      require: customRequire,
      _jsx: React.createElement,
      _jsxFragment: React.Fragment,
    },
    true
  );

  // TODO: do additional checks to make sure the module is valid

  return mod.default;
}

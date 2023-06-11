import fs from "fs";
import os from "os";
import path from "path";

import * as blastAPI from "@blastlauncher/api";
import _eval from "eval";
import React from "react";

// hook blastAPI to require('@raycast/api')

// const extensionRootPackagePath = path.join(os.homedir(), '.blast', 'extensions')
// process.chdir(extensionRootPackagePath)

export function evalCommandModule(pkg: string) {
  // console.log("evalCommandModule", pkg);
  // try {
  //   // eslint-disable-next-line @typescript-eslint/no-var-requires
  //   return globalThis["" + "require"]?.(pkg).default;
  // } catch (e) {
  //   console.error(e);
  //   return null;
  // }

  const jsCode = fs.readFileSync(pkg, "utf8");

  // TODO: might need to hook into the require function to make sure
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

  // If we use rollup for bundling, we can use the following:
  // return mod;
  // https://github.com/rollup/rollup/issues/3284
  //
  // Stay mod.default for compatibility with official raycast build, might be changed in the future
  return mod.default;
}

export type DemoStatus =
  | { stage: "ready"; text: "Ready"; error: false }
  | { stage: "fetching"; text: "Fetching extension…"; error: false }
  | { stage: "installing"; text: "Installing…"; error: false }
  | { stage: "bundling"; text: "Bundling…"; error: false }
  | { stage: "starting"; text: "Starting…"; error: false }
  | { stage: "error"; text: string; error: true }
  | { stage: "info"; text: string; error: false };

export const statusForStage = (
  stage: Exclude<DemoStatus["stage"], "error" | "info">,
): DemoStatus => {
  if (stage === "ready") return { stage, text: "Ready", error: false };
  if (stage === "fetching") return { stage, text: "Fetching extension…", error: false };
  if (stage === "installing") return { stage, text: "Installing…", error: false };
  if (stage === "bundling") return { stage, text: "Bundling…", error: false };
  return { stage: "starting", text: "Starting…", error: false };
};

export const statusError = (text: string): DemoStatus => ({ stage: "error", text, error: true });
export const statusInfo = (text: string): DemoStatus => ({ stage: "info", text, error: false });

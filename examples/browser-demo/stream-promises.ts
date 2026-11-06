import { finished as finishedCallback, pipeline as pipelineCallback } from "stream";
import { promisify } from "util";

/** Promise wrappers for almostnode's callback-based stream shim. */
export const pipeline = promisify(pipelineCallback);
export const finished = promisify(finishedCallback);

import { utilityProcess } from 'electron'

declare const UTILITY_PROCESS_MODULE_PATH: string;

let runtimeProcess: any;

export const startRuntime = (): void => {
  runtimeProcess = utilityProcess.fork(UTILITY_PROCESS_MODULE_PATH)
}

export const stopRuntime = (): void => {
  runtimeProcess.kill()
}


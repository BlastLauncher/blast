import { utilityProcess } from 'electron'

let runtimeProcess: any;

export const startRuntime = (): void => {
  const modulePath = require.resolve('@blastlauncher/runtime/dist/run.js')
  runtimeProcess = utilityProcess.fork(modulePath)
}

export const stopRuntime = (): void => {
  runtimeProcess.kill()
}


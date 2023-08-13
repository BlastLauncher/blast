import { NRM } from '@blastlauncher/utils'

import { NODE_INSTALL_PATH } from './constants'

const NODE_VERSION = "v18.17.1"

export const nrm = new NRM({
  installPath: NODE_INSTALL_PATH,
})

export function hasVersionInstalled () {
  return nrm.hasVersion(NODE_VERSION)
}

export function installNode () {
  return nrm.download(NODE_VERSION)
}


import { NRM } from '@blastlauncher/utils/src'

import { NODE_INSTALL_PATH } from '../constants'

export const NODE_VERSION = "v18.17.1"

export const nrm = new NRM({
  installPath: NODE_INSTALL_PATH,
})


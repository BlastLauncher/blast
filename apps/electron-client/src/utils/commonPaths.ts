import os from 'os'
import path from 'path'

import fs from 'fs-extra'

export const blastHome = path.join(os.homedir(), '.blast')
export const extensionHome = path.join(blastHome, 'extensions')
export const logDir = path.join(blastHome, 'logs')


fs.ensureDirSync(blastHome)
fs.ensureDirSync(extensionHome)
fs.ensureDirSync(logDir)

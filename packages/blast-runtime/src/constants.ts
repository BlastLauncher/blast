import os from 'node:os'
import path from 'node:path'

export const USER_DIR = path.join(os.homedir(), '.blast')
export const NODE_INSTALL_PATH = path.join(USER_DIR, 'node')
export const EXTENSIONS_DIR = path.join(USER_DIR, 'extensions')
export const DEV_EXTENSIONS_DIR = path.join(USER_DIR, 'dev-extensions')

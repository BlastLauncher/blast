import { Environment, LaunchType } from '../LaunchType'

export let environment: Environment = {
  assetsPath: '',
  commandMode: 'view',
  commandName: '',
  extensionName: '',
  isDevelopment: false,
  launchType: LaunchType.UserInitiated,
  raycastVersion: '',
  supportPath: '',
  textSize: 'medium',
  theme: 'light',
}

// TODO: prepare environment when command loads
export function prepareEnvironment(env: Environment) {
  environment = env
}

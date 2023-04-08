import { NpmRegistryClient } from './npmClient'

const client = new NpmRegistryClient()

const org = '@blast-extensions'

export async function searchExtensions (query: string) {
  const result = await client.search(`${org} ${query}`)

  const packages = result.objects.map(obj => obj.package).filter(pkg => pkg.name.startsWith(org))

  return packages
}


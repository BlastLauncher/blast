// Love you GPT4 chan
// https://shareg.pt/dW8GsZO
import fetch from "node-fetch";

type Registry = {
  db_name: string;
  doc_count: number;
  doc_del_count: number;
  update_seq: number;
  purge_seq: number;
  compact_running: boolean;
  disk_size: number;
  data_size: number;
  instance_start_time: string;
  disk_format_version: number;
  committed_update_seq: number;
};

type Package = {
  _id: string;
  _rev: string;
  name: string;
  description: string;
  "dist-tags": { [key: string]: string };
  versions: Version[];
  time: { created: string; modified: string };
  author: { name: string; email?: string; url?: string };
  repository: { type: string; url: string };
  _attachments: any;
  readme: string;
};

type Version = {
  name: string;
  version: string;
  homepage?: string;
  repository?: { type: string; url: string };
  dependencies?: { [key: string]: string };
  devDependencies?: { [key: string]: string };
  scripts?: { [key: string]: string };
  author?: { name: string; email?: string; url?: string };
  license?: string;
  readme?: string;
  readmeFilename?: string;
  _id: string;
  description?: string;
  dist?: { shasum: string; tarball: string };
  _npmVersion?: string;
  _npmUser?: { name: string; email: string };
  maintainers?: { name: string; email: string }[];
  directories?: any;
};

type SearchResult = {
  objects: {
    package: {
      name: string;
      version: string;
      description: string;
      keywords: string[];
      date: string;
      links: {
        npm: string;
        homepage: string;
        repository: string;
        bugs: string;
      };
      publisher: {
        username: string;
        email: string;
      };
      maintainers: {
        username: string;
        email: string;
      }[];
    };
    score: {
      final: number;
      detail: {
        quality: number;
        popularity: number;
        maintenance: number;
      };
    };
    searchScore: number;
  }[];
  total: number;
  time: string;
};

export class NpmRegistryClient {
  private readonly apiUrl: string;

  constructor(apiUrl = "https://registry.npmjs.org") {
    this.apiUrl = apiUrl;
  }

  async getRegistryInfo(): Promise<Registry> {
    const response = await fetch(this.apiUrl);
    return response.json() as Promise<Registry>;
  }

  async getPackage(packageName: string): Promise<Package> {
    const response = await fetch(`${this.apiUrl}/${packageName}`);
    return response.json() as Promise<Package>;
  }

  async getVersion(packageName: string, version: string): Promise<Version> {
    const response = await fetch(`${this.apiUrl}/${packageName}/${version}`);
    return response.json() as Promise<Version>;
  }

  async search(
    query: string,
    size?: number,
    from?: number,
    quality?: number,
    popularity?: number,
    maintenance?: number
  ): Promise<SearchResult> {
    const searchParams = new URLSearchParams({ text: query });

    if (size) searchParams.set("size", size.toString());
    if (from) searchParams.set("from", from.toString());
    if (quality) searchParams.set("quality", quality.toString());
    if (popularity) searchParams.set("popularity", popularity.toString());
    if (maintenance) searchParams.set("maintenance", maintenance.toString());

    const response = await fetch(`${this.apiUrl}/-/v1/search?${searchParams.toString()}`);
    return response.json() as Promise<SearchResult>;
  }
}

import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config.js";
import { getHermesHomeDir } from "./hermes-paths.js";

export type ProfileStore = {
  readText(key: string): Promise<string | null>;
  writeText(key: string, content: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  listPrefixes(prefix: string): Promise<string[]>;
  remove(key: string, opts?: { recursive?: boolean }): Promise<void>;
  ensureDir(_key: string): Promise<void>;
};

/** Normalize to forward-slash object keys with no leading slash. */
export function profileKey(...parts: string[]): string {
  return parts
    .join("/")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");
}

class LocalProfileStore implements ProfileStore {
  constructor(private root: string) {}

  private abs(key: string): string {
    return path.join(this.root, key.replace(/\//g, path.sep));
  }

  async readText(key: string): Promise<string | null> {
    try {
      return await fs.readFile(this.abs(key), "utf8");
    } catch {
      return null;
    }
  }

  async writeText(key: string, content: string): Promise<void> {
    const file = this.abs(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, "utf8");
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.abs(key));
      return true;
    } catch {
      return false;
    }
  }

  async listPrefixes(prefix: string): Promise<string[]> {
    const dir = this.abs(prefix);
    try {
      return await fs.readdir(dir);
    } catch {
      return [];
    }
  }

  async remove(key: string, opts?: { recursive?: boolean }): Promise<void> {
    await fs.rm(this.abs(key), { recursive: opts?.recursive ?? false, force: true });
  }

  async ensureDir(key: string): Promise<void> {
    await fs.mkdir(this.abs(key), { recursive: true });
  }
}

class GcsProfileStore implements ProfileStore {
  private bucket: import("@google-cloud/storage").Bucket | null = null;

  constructor(
    private bucketName: string,
    private prefix: string
  ) {}

  private async getBucket() {
    if (!this.bucket) {
      const { Storage } = await import("@google-cloud/storage");
      this.bucket = new Storage().bucket(this.bucketName);
    }
    return this.bucket;
  }

  private objectKey(key: string): string {
    const normalized = profileKey(key);
    return this.prefix ? `${this.prefix}/${normalized}` : normalized;
  }

  async readText(key: string): Promise<string | null> {
    const bucket = await this.getBucket();
    try {
      const [buf] = await bucket.file(this.objectKey(key)).download();
      return buf.toString("utf8");
    } catch {
      return null;
    }
  }

  async writeText(key: string, content: string): Promise<void> {
    const bucket = await this.getBucket();
    await bucket.file(this.objectKey(key)).save(content, {
      contentType: key.endsWith(".yaml") ? "application/x-yaml" : "text/plain",
      resumable: false,
    });
  }

  async exists(key: string): Promise<boolean> {
    const bucket = await this.getBucket();
    const [exists] = await bucket.file(this.objectKey(key)).exists();
    return exists;
  }

  async listPrefixes(prefix: string): Promise<string[]> {
    const bucket = await this.getBucket();
    const objectPrefix = this.objectKey(prefix.endsWith("/") ? prefix : `${prefix}/`);
    const [files] = await bucket.getFiles({ prefix: objectPrefix, delimiter: "/" });
    const names = new Set<string>();
    for (const file of files) {
      const rel = file.name.slice(objectPrefix.length);
      const top = rel.split("/")[0];
      if (top) names.add(top);
    }
    return [...names].sort();
  }

  async remove(key: string, opts?: { recursive?: boolean }): Promise<void> {
    const bucket = await this.getBucket();
    const objectKey = this.objectKey(key);
    if (!opts?.recursive) {
      await bucket.file(objectKey).delete({ ignoreNotFound: true });
      return;
    }
    const [files] = await bucket.getFiles({ prefix: objectKey.endsWith("/") ? objectKey : `${objectKey}/` });
    await Promise.all(files.map((f) => f.delete({ ignoreNotFound: true })));
  }

  async ensureDir(_key: string): Promise<void> {
    /* GCS has no directories */
  }
}

class CompositeProfileStore implements ProfileStore {
  constructor(
    private primary: ProfileStore,
    private mirror?: ProfileStore
  ) {}

  async readText(key: string): Promise<string | null> {
    const remote = await this.primary.readText(key);
    if (remote != null) return remote;
    if (this.mirror) return this.mirror.readText(key);
    return null;
  }

  async writeText(key: string, content: string): Promise<void> {
    await this.primary.writeText(key, content);
    if (this.mirror) await this.mirror.writeText(key, content);
  }

  async exists(key: string): Promise<boolean> {
    if (this.mirror && (await this.mirror.exists(key))) return true;
    return this.primary.exists(key);
  }

  async listPrefixes(prefix: string): Promise<string[]> {
    const a = this.mirror ? await this.mirror.listPrefixes(prefix) : [];
    const b = await this.primary.listPrefixes(prefix);
    return [...new Set([...a, ...b])].sort();
  }

  async remove(key: string, opts?: { recursive?: boolean }): Promise<void> {
    await this.primary.remove(key, opts);
    if (this.mirror) await this.mirror.remove(key, opts);
  }

  async ensureDir(key: string): Promise<void> {
    await this.primary.ensureDir(key);
    if (this.mirror) await this.mirror.ensureDir(key);
  }
}

let store: ProfileStore | null = null;

export function getProfileStore(): ProfileStore {
  if (store) return store;

  const local = new LocalProfileStore(getHermesHomeDir());

  if (env.gcsProfileBucket) {
    const gcs = new GcsProfileStore(env.gcsProfileBucket, env.gcsProfilePrefix);
    // GCS is source of truth; mirror to local for same-host Hermes / fast reads
    store = new CompositeProfileStore(gcs, local);
    return store;
  }

  store = local;
  return store;
}

/** For tests / hot reload */
export function resetProfileStore(): void {
  store = null;
}

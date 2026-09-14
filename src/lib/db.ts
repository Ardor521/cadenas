import type { Method } from './crypto';

const DB_NAME = 'cadenas-vault';
const STORE = 'items';

export interface VaultItem {
  id: string;
  name: string;
  size: number;
  method: Method;
  hint: string;
  fileCount: number | null;
  createdAt: number;
}

interface VaultRecord extends VaultItem {
  data: ArrayBuffer;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export async function addToVault(
  name: string,
  data: Uint8Array<ArrayBuffer>,
  info: { method: Method; hint: string; fileCount: number | null },
): Promise<VaultItem> {
  const record: VaultRecord = {
    id: crypto.randomUUID(),
    name,
    size: data.byteLength,
    method: info.method,
    hint: info.hint,
    fileCount: info.fileCount,
    createdAt: Date.now(),
    data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
  };
  await tx('readwrite', (s) => s.add(record));
  const { data: _omit, ...item } = record;
  void _omit;
  return item;
}

export async function listVault(): Promise<VaultItem[]> {
  const all = await tx<VaultRecord[]>('readonly', (s) => s.getAll());
  return all
    .map(({ data: _d, ...item }) => {
      void _d;
      return item;
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getVaultData(id: string): Promise<{ item: VaultItem; bytes: Uint8Array<ArrayBuffer> } | null> {
  const rec = await tx<VaultRecord | undefined>('readonly', (s) => s.get(id));
  if (!rec) return null;
  const { data, ...item } = rec;
  return { item, bytes: new Uint8Array(data) };
}

export async function removeFromVault(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
}

export async function renameVaultItem(id: string, name: string): Promise<void> {
  const rec = await tx<VaultRecord | undefined>('readonly', (s) => s.get(id));
  if (!rec) return;
  rec.name = name;
  await tx('readwrite', (s) => s.put(rec));
}

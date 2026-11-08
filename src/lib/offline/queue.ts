/**
 * Offline write queue (Phase 3 groundwork).
 *
 * Every mutation is stored with a client-generated idempotency key, which is
 * passed to the Postgres RPC. Retrying a queued order after a reconnect can
 * therefore never create a duplicate: `create_order` and `record_payment`
 * both look up the key before inserting.
 *
 * This module touches IndexedDB, so it must only be imported from client
 * components or event handlers.
 */

export type MutationKind =
  | "create_order"
  | "add_order_items"
  | "update_order_status"
  | "generate_bill"
  | "record_payment";

export type QueuedMutation<TPayload = unknown> = {
  id: string;
  kind: MutationKind;
  payload: TPayload;
  /** Sent to the RPC so a retry is recognised as the same operation. */
  idempotencyKey: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
};

const DB_NAME = "resto-offline";
const DB_VERSION = 1;
const STORE = "mutations";

export function offlineQueueSupported() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = run(tx.objectStore(STORE));

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

export async function enqueue<TPayload>(
  kind: MutationKind,
  payload: TPayload,
  idempotencyKey: string = crypto.randomUUID(),
) {
  const mutation: QueuedMutation<TPayload> = {
    id: crypto.randomUUID(),
    kind,
    payload,
    idempotencyKey,
    createdAt: Date.now(),
    attempts: 0,
  };

  await transaction("readwrite", (store) => store.add(mutation));

  return mutation;
}

export async function listPending(): Promise<QueuedMutation[]> {
  const rows = await transaction<QueuedMutation[]>("readonly", (store) =>
    store.getAll(),
  );

  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function pendingCount() {
  if (!offlineQueueSupported()) {
    return 0;
  }

  return transaction<number>("readonly", (store) => store.count());
}

export async function remove(id: string) {
  await transaction("readwrite", (store) => store.delete(id));
}

export async function markFailed(id: string, error: unknown) {
  const db = await openDb();
  const mutation = await new Promise<QueuedMutation | undefined>(
    (resolve, reject) => {
      const request = db
        .transaction(STORE, "readonly")
        .objectStore(STORE)
        .get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    },
  );

  if (!mutation) {
    db.close();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({
      ...mutation,
      attempts: mutation.attempts + 1,
      lastError: error instanceof Error ? error.message : String(error),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();
}

export type FlushResult = {
  synced: number;
  failed: number;
  remaining: number;
};

/**
 * Replays the queue oldest-first.
 *
 * Stops at the first failure so a later mutation never overtakes an earlier
 * one (for example, a payment must not sync before its bill exists).
 */
export async function flushQueue(
  send: (mutation: QueuedMutation) => Promise<void>,
): Promise<FlushResult> {
  const pending = await listPending();
  let synced = 0;
  let failed = 0;

  for (const mutation of pending) {
    try {
      await send(mutation);
      await remove(mutation.id);
      synced += 1;
    } catch (error) {
      await markFailed(mutation.id, error);
      failed += 1;
      break;
    }
  }

  return { synced, failed, remaining: await pendingCount() };
}

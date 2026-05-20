import { openDB, type IDBPDatabase } from "idb";

/**
 * IndexedDB-backed blob store for large wizard artifacts.
 *
 * Why not sessionStorage: a 30-page PDF rendered at scale 2x produces
 * ~2 MB of base64 per page. SessionStorage caps at ~5 MB total in most
 * browsers, so we'd hit the quota after 2 pages. IndexedDB has no such
 * cap (origin-bound, gigabyte-scale).
 *
 * Why not just keep them in memory: the user can refresh mid-flow and we
 * need to restore the wizard from sessionStorage. The store keeps an
 * `imageRef` string (UUID) and we round-trip the bytes through here.
 *
 * Stores:
 *   - `pageImages`: keyed by ref id, value = `{ pageNum, dataUrl }`
 *   - `pdfBlobs`: keyed by test id, value = original File (Phase 4 ⏎ Phase 5)
 */

const DB_NAME = "mathgen";
const DB_VERSION = 1;
const PAGE_IMAGES = "pageImages";
const PDF_BLOBS = "pdfBlobs";

export interface PageImage {
  pageNum: number;
  dataUrl: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

const getDb = (): Promise<IDBPDatabase> => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(PAGE_IMAGES)) {
          db.createObjectStore(PAGE_IMAGES);
        }
        if (!db.objectStoreNames.contains(PDF_BLOBS)) {
          db.createObjectStore(PDF_BLOBS);
        }
      },
    });
  }
  return dbPromise;
};

const uid = (): string => crypto.randomUUID();

/** Store a page image, return its ref id. */
export const putPageImage = async (image: PageImage): Promise<string> => {
  const id = uid();
  const db = await getDb();
  await db.put(PAGE_IMAGES, image, id);
  return id;
};

/** Retrieve a page image by ref id. Returns undefined if expired/missing. */
export const getPageImage = async (ref: string): Promise<PageImage | undefined> => {
  const db = await getDb();
  return db.get(PAGE_IMAGES, ref);
};

/** Bulk delete a set of refs — used when reset()ing the wizard. */
export const deletePageImages = async (refs: string[]): Promise<void> => {
  if (refs.length === 0) return;
  const db = await getDb();
  const tx = db.transaction(PAGE_IMAGES, "readwrite");
  await Promise.all(refs.map((r) => tx.store.delete(r)));
  await tx.done;
};

/** Store an uploaded PDF blob keyed by test id (Phase 4 export reuse). */
export const putPdfBlob = async (testId: string, file: File): Promise<void> => {
  const db = await getDb();
  await db.put(PDF_BLOBS, file, testId);
};

export const getPdfBlob = async (testId: string): Promise<File | undefined> => {
  const db = await getDb();
  return db.get(PDF_BLOBS, testId);
};

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
 *   - `pageImages`:     hi-res base64 (for AI / detail view), keyed by ref id
 *   - `pageThumbnails`: low-res JPEG (for thumbnail column), keyed by ref id
 *     Kept separate so the Step 2 thumbnail column doesn't transitively
 *     load ~2 MB hi-res bytes every time it renders a 64 px card.
 *   - `pdfBlobs`:       original PDF File, keyed by test id (Phase 4 ⏎ Phase 5)
 */

const DB_NAME = "mathgen";
const DB_VERSION = 2;
const PAGE_IMAGES = "pageImages";
const PAGE_THUMBNAILS = "pageThumbnails";
const PDF_BLOBS = "pdfBlobs";

export interface PageImage {
  pageNum: number;
  dataUrl: string;
}

export interface PageThumbnail {
  pageNum: number;
  dataUrl: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

/**
 * Why all the diagnostic callbacks: a hang inside `openDB` is silent —
 * `getDb()` just never resolves, every downstream `getPageImage` /
 * `getThumbnail` waits forever, and the OCR pipeline goes 0/N. The two
 * realistic causes are (a) another tab holding the DB at an older version
 * while we try to upgrade (`blocked` fires), and (b) the connection
 * getting force-closed by another tab after we opened it (`terminated`
 * fires after the fact). Both surface in the console here so the user
 * doesn't have to guess.
 */
const getDb = (): Promise<IDBPDatabase> => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(PAGE_IMAGES)) {
          db.createObjectStore(PAGE_IMAGES);
        }
        if (!db.objectStoreNames.contains(PAGE_THUMBNAILS)) {
          db.createObjectStore(PAGE_THUMBNAILS);
        }
        if (!db.objectStoreNames.contains(PDF_BLOBS)) {
          db.createObjectStore(PDF_BLOBS);
        }
      },
      blocked(currentVersion, blockedVersion) {
        // 다른 탭이 이전 version 의 DB 를 들고 있어서 우리 upgrade 가
        // 차단됨. 이 상태에선 openDB 가 영원히 resolve 안 함 — 다른
        // mathgen 탭을 닫아야 풀린다.
        // eslint-disable-next-line no-console
        console.error(
          `[imageStore] IndexedDB upgrade BLOCKED — 다른 탭이 v${currentVersion} ` +
            `를 잡고 있어 v${blockedVersion} 로 업그레이드 불가. 다른 모든 ` +
            `localhost:3000 탭을 닫고 새로고침 하세요.`,
        );
      },
      blocking() {
        // eslint-disable-next-line no-console
        console.warn("[imageStore] This tab is BLOCKING another tab's DB upgrade.");
      },
      terminated() {
        // eslint-disable-next-line no-console
        console.error(
          "[imageStore] IndexedDB connection terminated unexpectedly. " +
            "Reload the page to reopen.",
        );
        dbPromise = null;
      },
    });
    // openDB 자체에 timeout — blocked / terminated / OS-level lock 등
    // 어떤 이유로든 5초 내 resolve 안 되면 dbPromise 를 reject 시켜서
    // hang 대신 명확한 에러로 변환.
    dbPromise = Promise.race([
      dbPromise,
      new Promise<IDBPDatabase>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                "IndexedDB open timeout (5s) — 다른 탭이 DB 를 lock 하고 " +
                  "있거나 브라우저 storage 가 손상되었을 수 있습니다. " +
                  "F12 → Application → Storage → 'Clear site data' 후 새로고침.",
              ),
            ),
          5000,
        ),
      ),
    ]).catch((err) => {
      // 캐시된 promise 가 reject 상태로 굳지 않도록 reset — 다음 호출에서
      // 다시 openDB 시도할 기회를 준다.
      dbPromise = null;
      throw err;
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

/** Store a page thumbnail (low-res JPEG), return its ref id. */
export const putThumbnail = async (thumb: PageThumbnail): Promise<string> => {
  const id = uid();
  const db = await getDb();
  await db.put(PAGE_THUMBNAILS, thumb, id);
  return id;
};

/** Retrieve a page thumbnail by ref id. Returns undefined if expired/missing. */
export const getThumbnail = async (ref: string): Promise<PageThumbnail | undefined> => {
  const db = await getDb();
  return db.get(PAGE_THUMBNAILS, ref);
};

/** Bulk delete a set of thumbnail refs — used when reset()ing the wizard. */
export const deleteThumbnails = async (refs: string[]): Promise<void> => {
  if (refs.length === 0) return;
  const db = await getDb();
  const tx = db.transaction(PAGE_THUMBNAILS, "readwrite");
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

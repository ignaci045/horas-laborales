import { initialData, type Data } from "./domain";
let connection: Promise<IDBDatabase> | undefined;
function openDB(): Promise<IDBDatabase> {
  if (!connection)
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open("horas-laborales", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("app");
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          connection = undefined;
        };
        resolve(request.result);
      };
      request.onerror = () => {
        connection = undefined;
        reject(
          new Error(
            "No pudimos abrir el almacenamiento local. Revisá los permisos del navegador.",
          ),
        );
      };
      request.onblocked = () => {
        connection = undefined;
        reject(
          new Error(
            "Cerrá otras pestañas de Horas Laborales e intentá de nuevo.",
          ),
        );
      };
    });
  return connection;
}
export async function readData(): Promise<Data> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("app", "readonly");
    const req = tx.objectStore("app").get("data");
    tx.oncomplete = () => resolve(req.result || initialData());
    tx.onerror = () => reject(tx.error);
  });
}
// Revision is checked inside the read/write transaction to prevent lost updates between tabs.
export async function saveData(
  next: Data,
  expectedRevision: number,
): Promise<Data> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("app", "readwrite");
    const store = tx.objectStore("app");
    const req = store.get("data");
    let conflict = false;
    const saved = { ...next, revision: expectedRevision + 1 };
    req.onsuccess = () => {
      if ((req.result?.revision ?? 0) !== expectedRevision) {
        conflict = true;
        tx.abort();
        return;
      }
      store.put(saved, "data");
    };
    tx.oncomplete = () => resolve(saved);
    tx.onabort = () =>
      reject(
        new Error(
          conflict
            ? "Los datos cambiaron en otra pestaña. Ya los actualizamos; repetí la operación."
            : "No se pudo guardar. Tus datos anteriores se conservan. Revisá el espacio disponible.",
        ),
      );
    tx.onerror = () => {};
  });
}

export interface SaveResult {
  saved: boolean;
  path?: string;
  error?: string;
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const extension = (name: string): string => {
  const m = name.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
};

const filterFor = (ext: string): { name: string; extensions: string[] }[] => {
  if (ext === 'png') return [{ name: 'PNG', extensions: ['png'] }];
  if (ext === 'pdf') return [{ name: 'PDF', extensions: ['pdf'] }];
  if (ext === 'csv') return [{ name: 'CSV', extensions: ['csv'] }];
  if (ext === 'json') return [{ name: 'JSON', extensions: ['json'] }];
  return [{ name: 'Archivo', extensions: [ext || '*'] }];
};

/**
 * Guarda un blob. En web usa descarga + vista previa para PNG/PDF.
 * En Tauri abre el diálogo nativo, escribe el archivo y lo abre con el
 * programa del sistema. Devuelve la ruta elegida.
 */
export async function saveBlob(blob: Blob, filename: string, preview = true): Promise<SaveResult> {
  const ext = extension(filename);
  if (isTauri()) {
    try {
      const [{ save }, { invoke }, { openPath }] = await Promise.all([
        import('@tauri-apps/plugin-dialog'),
        import('@tauri-apps/api/core'),
        import('@tauri-apps/plugin-opener'),
      ]);
      const path = await save({
        defaultPath: filename,
        filters: filterFor(ext),
      });
      if (!path) return { saved: false };
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      await invoke('save_binary', { path, data: bytes });
      if (preview) {
        try { await openPath(path); } catch { /* sin asociación: el archivo ya está guardado */ }
      }
      return { saved: true, path };
    } catch (err) {
      return { saved: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.click();
    if (preview && (ext === 'png' || ext === 'pdf')) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return { saved: true, path: 'Descargas' };
  } catch (err) {
    return { saved: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function saveText(text: string, filename: string, mime: string, preview = false): Promise<SaveResult> {
  return saveBlob(new Blob([text], { type: mime }), filename, preview);
}

/**
 * Guardado de archivos.
 *
 * En web no se puede elegir carpeta sin permisos, así que descargo y, para
 * PNG/PDF, abro una vista previa. En Tauri el diálogo nativo se abre desde
 * Rust (`save_export`), validando la extensión en lista blanca.
 */
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

/**
 * Guarda un blob. En web usa descarga + vista previa para PNG/PDF.
 * En Tauri el diálogo nativo se abre desde Rust (`save_export`), validando
 * la extensión y abriendo solo archivos PNG/PDF recién guardados.
 */
export async function saveBlob(blob: Blob, filename: string, preview = true): Promise<SaveResult> {
  const ext = extension(filename);
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      const path = await invoke<string | null>('save_export', {
        filename,
        data: bytes,
        openAfter: preview,
      });
      if (!path) return { saved: false };
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

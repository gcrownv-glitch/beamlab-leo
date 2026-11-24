/**
 * Persistencia local del laboratorio.
 *
 * No hay backend. La sesión vive en localStorage y el usuario se la lleva en
 * JSON. La web y Tauri tienen almacenamientos separados, así que el JSON es
 * también la forma de mover una práctica entre ambos.
 */
import { createSession, samplesToCsv, validateLabSession, type LabSession } from './core/lab';
import { saveText, type SaveResult } from './save';

const STORAGE_KEY = 'beamlab:lab:session:v1';
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export class LabStore {
  session: LabSession;

  constructor() {
    this.session = this.load() ?? createSession();
  }

  private load(): LabSession | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return validateLabSession(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  save(): void {
    this.session.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.session));
    } catch {
      // almacenamiento lleno o no disponible: la sesión sigue en memoria
    }
  }

  reset(): LabSession {
    this.session = createSession();
    this.save();
    return this.session;
  }

  updateFields(patch: Partial<Pick<LabSession, 'title' | 'course' | 'author' | 'notes'>>): void {
    Object.assign(this.session, patch);
    this.save();
  }

  addSample(sample: LabSession['samples'][number]): void {
    this.session.samples.push(sample);
    this.save();
  }

  removeSample(id: string): void {
    this.session.samples = this.session.samples.filter((s) => s.id !== id);
    this.save();
  }

  exportJson(): Promise<SaveResult> {
    return saveText(
      JSON.stringify(this.session, null, 2),
      `beamlab-${this.session.title.replace(/[^\w-]+/g, '-').slice(0, 40)}-${stamp()}.json`,
      'application/json',
      false,
    );
  }

  exportCsv(): Promise<SaveResult> {
    return saveText(
      samplesToCsv(this.session),
      `beamlab-${stamp()}.csv`,
      'text/csv;charset=utf-8',
      false,
    );
  }

  async importJson(file: File): Promise<LabSession> {
    if (file.size > MAX_IMPORT_BYTES) {
      throw new Error('El archivo excede el tamaño máximo permitido (5 MB).');
    }
    const text = await file.text();
    const session = validateLabSession(JSON.parse(text));
    this.session = session;
    this.save();
    return this.session;
  }
}

const stamp = (): string => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

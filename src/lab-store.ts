import { createSession, LAB_SCHEMA, samplesToCsv, type LabSession } from './core/lab';

const STORAGE_KEY = 'beamlab:lab:session:v1';

export class LabStore {
  session: LabSession;

  constructor() {
    this.session = this.load() ?? createSession();
  }

  private load(): LabSession | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as LabSession;
      if (!data || data.schema !== LAB_SCHEMA || !Array.isArray(data.samples)) return null;
      return data;
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

  exportJson(): void {
    downloadText(
      JSON.stringify(this.session, null, 2),
      `beamlab-${this.session.title.replace(/[^\w-]+/g, '-').slice(0, 40)}-${stamp()}.json`,
      'application/json',
    );
  }

  exportCsv(): void {
    downloadText(
      samplesToCsv(this.session),
      `beamlab-${stamp()}.csv`,
      'text/csv;charset=utf-8',
    );
  }

  async importJson(file: File): Promise<LabSession> {
    const text = await file.text();
    const data = JSON.parse(text) as LabSession;
    if (!data || data.schema !== LAB_SCHEMA || !Array.isArray(data.samples)) {
      throw new Error('El archivo no es una sesión BeamLab válida.');
    }
    this.session = data;
    this.save();
    return this.session;
  }
}

const stamp = (): string => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

export function downloadText(text: string, filename: string, type: string): void {
  const blob = new Blob([text], { type });
  downloadBlob(blob, filename);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

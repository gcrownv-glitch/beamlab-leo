import { describe, expect, it } from 'vitest';
import { Engine } from '../src/engine';
import { defaultState } from '../src/state';
import { buildSample, createSession, csvCell, samplesToCsv, validateLabSession } from '../src/core/lab';

import versionesHtml from '../public/versiones.html?raw';
import versionesJs from '../public/versiones.js?raw';
import libRs from '../src-tauri/src/lib.rs?raw';
import capabilitiesJson from '../src-tauri/capabilities/default.json?raw';
import tauriConfJson from '../src-tauri/tauri.conf.json?raw';
import netlifyToml from '../netlify.toml?raw';
import vercelJson from '../vercel.json?raw';
import actualizarPs1 from '../portable/Actualizar.ps1?raw';

const srcFiles = import.meta.glob('../src/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('hardening de seguridad (Tramo 3)', () => {
  it('neutraliza fórmulas peligrosas en CSV pero preserva números negativos', () => {
    expect(csvCell('=cmd|"/C calc"!A0')).toBe('"\'=cmd|""/C calc""!A0"');
    expect(csvCell('+1+1')).toBe("'+1+1");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell(' =1+1')).toBe("' =1+1");
    expect(csvCell(-12.05)).toBe('-12.05');
    expect(csvCell(-30.1)).toBe('-30.1');

    const state = defaultState();
    const engine = new Engine(state);
    const session = createSession();
    session.samples.push(buildSample(state, engine.derived, '=HYPERLINK("http://evil")'));
    const csv = samplesToCsv(session);
    expect(csv).toContain("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csv).toContain('-12.05');
  });

  it('validateLabSession valida esquema estricto y descarta claves extrañas o valores corruptos', () => {
    const state = defaultState();
    const engine = new Engine(state);
    const session = createSession();
    const sample = buildSample(state, engine.derived, 'nota válida');
    session.samples.push(sample);

    const poisoned = JSON.parse(JSON.stringify(session)) as Record<string, unknown>;
    poisoned.extraEvil = '<img src=x onerror=alert(1)>';
    const validated = validateLabSession(poisoned);
    expect(validated.samples).toHaveLength(1);
    expect('extraEvil' in (validated as unknown as Record<string, unknown>)).toBe(false);

    expect(() => validateLabSession({ ...poisoned, schema: 999 })).toThrow();
    expect(() => validateLabSession({ ...poisoned, samples: 'no-array' })).toThrow();
    const badSample = JSON.parse(JSON.stringify(sample));
    badSample.mode = 'invalid-mode';
    expect(() => validateLabSession({ ...poisoned, samples: [badSample] })).toThrow();
    const nanSample = JSON.parse(JSON.stringify(sample));
    nanSample.orbit.altKm = null;
    expect(() => validateLabSession({ ...poisoned, samples: [nanSample] })).toThrow();
  });

  it('elimina por completo innerHTML en src/ y public/versiones.*', () => {
    const entries: [string, string][] = [
      ...Object.entries(srcFiles),
      ['public/versiones.html', versionesHtml],
      ['public/versiones.js', versionesJs],
    ];
    expect(entries.length).toBeGreaterThan(10);
    for (const [name, content] of entries) {
      expect(content, `innerHTML encontrado en ${name}`).not.toMatch(/\binnerHTML\b/);
    }
    expect(versionesHtml).not.toMatch(/<script>\s*\(/);
  });

  it('endurece Tauri: save_export en Rust, permisos mínimos y devCsp separado', () => {
    expect(libRs).toContain('fn save_export');
    expect(libRs).not.toContain('save_binary');
    expect(libRs).toContain('blocking_save_file');

    const caps = JSON.parse(capabilitiesJson) as { permissions: string[] };
    expect(caps.permissions).not.toContain('opener:allow-open-path');
    expect(caps.permissions).not.toContain('dialog:default');

    const conf = JSON.parse(tauriConfJson) as {
      app: { security: { csp: string; devCsp?: string } };
    };
    expect(conf.app.security.csp).not.toContain('127.0.0.1');
    expect(conf.app.security.devCsp).toContain('127.0.0.1:5173');
  });

  it('define cabeceras CSP y X-Frame-Options en web y verificación fail-closed en Actualizar.ps1', () => {
    expect(netlifyToml).toContain('Content-Security-Policy');
    expect(netlifyToml).toContain('X-Frame-Options = "DENY"');

    expect(vercelJson).toContain('Content-Security-Policy');
    expect(vercelJson).toContain('"X-Frame-Options"');

    expect(actualizarPs1).toContain('$sha256Regex');
    expect(actualizarPs1).toContain('$semverRegex');
    expect(actualizarPs1).toContain('$trustedUrlRegex');
    expect(actualizarPs1).toContain('fail-closed');
  });
});

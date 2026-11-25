(() => {
  const ALLOWED_HOSTS = new Set(['gcrownv-glitch.github.io', 'github.com']);

  function safeUrl(raw) {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('./') && !trimmed.includes('..') && !/[\s<>"'`\\]/.test(trimmed)) {
      return trimmed;
    }
    try {
      const u = new URL(trimmed);
      if (u.protocol === 'https:' && ALLOWED_HOSTS.has(u.hostname)) {
        return u.toString();
      }
    } catch {
      return null;
    }
    return null;
  }

  function parseSemver(ver) {
    const m = String(ver || '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
    if (!m) return { major: 0, minor: 0, patch: 0, pre: null };
    return {
      major: Number(m[1]),
      minor: Number(m[2]),
      patch: Number(m[3]),
      pre: m[4] ? m[4].split('.') : null,
    };
  }

  function compareSemverDesc(a, b) {
    const pa = parseSemver(a);
    const pb = parseSemver(b);
    for (const k of ['major', 'minor', 'patch']) {
      if (pa[k] !== pb[k]) return pb[k] - pa[k];
    }
    if (pa.pre === null && pb.pre === null) return 0;
    if (pa.pre === null) return -1;
    if (pb.pre === null) return 1;
    const len = Math.max(pa.pre.length, pb.pre.length);
    for (let i = 0; i < len; i++) {
      const ia = pa.pre[i];
      const ib = pb.pre[i];
      if (ia === undefined) return 1;
      if (ib === undefined) return -1;
      const na = /^\d+$/.test(ia) ? Number(ia) : null;
      const nb = /^\d+$/.test(ib) ? Number(ib) : null;
      if (na !== null && nb !== null) {
        if (na !== nb) return nb - na;
      } else if (na !== null) {
        return 1;
      } else if (nb !== null) {
        return -1;
      } else if (ia !== ib) {
        return ib.localeCompare(ia);
      }
    }
    return 0;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function makeDownloadLink(href, label, subLabel) {
    const safe = safeUrl(href);
    if (!safe) return null;
    const a = el('a');
    a.href = safe;
    a.setAttribute('download', '');
    a.appendChild(document.createTextNode(label));
    if (subLabel) {
      a.appendChild(document.createTextNode(' '));
      a.appendChild(el('small', '', subLabel));
    }
    return a;
  }

  async function init() {
    const list = document.getElementById('list');
    try {
      const r = await fetch('./versions.json', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const m = await r.json();
      const versions = [...(Array.isArray(m && m.versions) ? m.versions : [])]
        .filter((v) => v && typeof v.version === 'string')
        .sort((a, b) => compareSemverDesc(a.version, b.version));
      if (!versions.length) throw new Error('sin versiones');

      const latestStableVer = versions.find((v) => !v.version.includes('-'))?.version ?? '';
      const cards = versions.map((v, i) => {
        const card = el('div', 'card');
        const isBeta = v.version.includes('-') || v.channel === 'beta';

        const row = el('div', 'row');
        const titleGroup = el('div');
        const htmlHref = safeUrl(v.html);
        if (htmlHref) {
          const verLink = el('a', 'ver', v.version);
          verLink.href = htmlHref;
          verLink.setAttribute('download', '');
          titleGroup.appendChild(verLink);
        } else {
          titleGroup.appendChild(el('span', 'ver', v.version));
        }
        if (isBeta) {
          titleGroup.appendChild(el('span', 'badge-beta', 'beta'));
        }
        row.appendChild(titleGroup);
        if (v.version === latestStableVer) {
          row.appendChild(el('span', 'latest', i === 0 ? 'estable · más reciente' : 'estable'));
        } else if (i === 0) {
          row.appendChild(el('span', 'latest', 'pre-release más reciente'));
        }
        card.appendChild(row);

        const sizeMb = typeof v.size === 'number' && Number.isFinite(v.size)
          ? `${(v.size / 1024 / 1024).toFixed(2)} MB`
          : '—';
        const dateStr = typeof v.date === 'string' ? v.date : '';
        card.appendChild(el('div', 'meta', `${sizeMb} · ${dateStr}`));

        if (typeof v.notes === 'string' && v.notes) {
          card.appendChild(el('div', 'notes', v.notes));
        }
        card.appendChild(el('div', 'hash', `SHA-256 ${typeof v.sha256 === 'string' ? v.sha256 : ''}`));

        const actions = el('div', 'actions');
        if (htmlHref) {
          const aHtml = el('a', '', 'Descargar HTML');
          aHtml.href = htmlHref;
          aHtml.setAttribute('download', '');
          actions.appendChild(aHtml);
        }
        const zipHref = safeUrl(v.zip);
        if (zipHref) {
          const aZip = el('a', '', 'Descargar ZIP portable');
          aZip.href = zipHref;
          aZip.setAttribute('download', '');
          actions.appendChild(aZip);
        }
        const relHref = safeUrl(v.release);
        if (relHref) {
          const aRel = el('a', '', 'Release / notas');
          aRel.href = relHref;
          aRel.target = '_blank';
          aRel.rel = 'noopener noreferrer';
          actions.appendChild(aRel);
        }
        if (actions.childElementCount > 0) card.appendChild(actions);

        if (v.downloads && typeof v.downloads === 'object') {
          const dl = el('div', 'downloads');
          const items = [
            [v.downloads.windowsInstaller, 'Windows · instalador', 'con desinstalador'],
            [v.downloads.windowsPortable, 'Windows · portable', 'sin instalar'],
            [v.downloads.linuxAppImage, 'Ubuntu · AppImage', 'portable'],
            [v.downloads.linuxDeb, 'Ubuntu · .deb', 'paquete'],
            [v.downloads.macDmg, 'macOS ARM64 · .dmg', 'Apple Silicon'],
          ];
          for (const [href, label, sub] of items) {
            const link = makeDownloadLink(href, label, sub);
            if (link) dl.appendChild(link);
          }
          if (dl.childElementCount > 0) card.appendChild(dl);
        }

        return card;
      });

      list.replaceChildren(...cards);
    } catch {
      list.hidden = true;
      document.getElementById('fallback').hidden = false;
    }
  }

  void init();
})();

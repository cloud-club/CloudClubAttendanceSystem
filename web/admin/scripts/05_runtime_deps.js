window.AdminRuntimeDeps = (function createAdminRuntimeDeps(global) {
  'use strict';

  const depLoaders = {
    qrcode: {
      src: 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
      isReady: () => typeof global.QRCode !== 'undefined'
    },
    papa: {
      src: 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js',
      isReady: () => !!(global.Papa && typeof global.Papa.parse === 'function')
    },
    xlsx: {
      src: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
      isReady: () => !!(global.XLSX && global.XLSX.utils)
    },
    chart: {
      src: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js',
      isReady: () => typeof global.Chart !== 'undefined'
    }
  };

  const inflightByDep = {};

  function getLoader(depName) {
    return depLoaders[String(depName || '').trim().toLowerCase()] || null;
  }

  function loadScript(depName, loader) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = loader.src;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.referrerPolicy = 'no-referrer';
      script.onload = () => {
        if (loader.isReady()) {
          resolve(true);
          return;
        }
        reject(new Error(`[deps] ${depName} loaded but global symbol is missing.`));
      };
      script.onerror = () => {
        reject(new Error(`[deps] failed to load ${depName}: ${loader.src}`));
      };
      document.head.appendChild(script);
    });
  }

  function ensure(depName) {
    const normalized = String(depName || '').trim().toLowerCase();
    if (!normalized) {
      return Promise.reject(new Error('[deps] dependency name is required.'));
    }

    const loader = getLoader(normalized);
    if (!loader) {
      return Promise.reject(new Error(`[deps] unknown dependency: ${normalized}`));
    }

    if (loader.isReady()) {
      return Promise.resolve(true);
    }

    if (inflightByDep[normalized]) {
      return inflightByDep[normalized];
    }

    inflightByDep[normalized] = loadScript(normalized, loader)
      .finally(() => {
        delete inflightByDep[normalized];
      });

    return inflightByDep[normalized];
  }

  function ensureMany(depNames) {
    const list = Array.isArray(depNames) ? depNames : [depNames];
    return Promise.all(list.map(ensure));
  }

  function isReady(depName) {
    const loader = getLoader(depName);
    return !!(loader && loader.isReady());
  }

  return {
    ensure,
    ensureMany,
    isReady
  };
})(window);

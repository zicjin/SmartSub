import type JASSUB from 'jassub';

type JassubModule = { default: typeof JASSUB };

let modulePromise: Promise<JassubModule> | undefined;

function assetUrl(name: string) {
  const page = new URL(window.location.href);
  const root =
    page.protocol === 'app:'
      ? 'app://./'
      : page.protocol === 'file:'
        ? new URL('.', page.href).href
        : `${page.origin}/`;
  return new URL(name, root).href;
}

export function jassubAssetUrl(name: string) {
  return assetUrl(`jassub/${name}`);
}

export function loadJassub() {
  // Keep Jest's module mock usable without putting the package back into the
  // Turbopack dependency graph. Production and development always use the
  // prebundled browser asset below.
  if (process.env.NODE_ENV === 'test') {
    const requireModule = eval('require') as (name: string) => JassubModule;
    return Promise.resolve(requireModule('jassub'));
  }
  modulePromise ??= import(
    /* webpackIgnore: true */ assetUrl('jassub/jassub.js')
  ) as Promise<JassubModule>;
  return modulePromise;
}

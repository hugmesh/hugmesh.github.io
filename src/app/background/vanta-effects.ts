/**
 * Lazy loader for the animated backdrop.
 *
 * Every import here is DYNAMIC, and that is the entire point. Vanta takes the
 * three.js module NAMESPACE by injection (`{ THREE }`), so a bundler cannot
 * tree-shake it — measured on the sibling UIs it is a ~735 KB chunk, ~154 KB over
 * the wire. On a documentation site the text has to paint before a decorative
 * backdrop has downloaded anything, so nothing below is fetched until
 * {@link loadVantaEffect} is called, and it is not called at all when the reader
 * asked for reduced motion or the machine has no WebGL.
 *
 * The import map is a STATIC record of thunks rather than a template literal: a
 * bundler can only split what it can see at build time, and `import('vanta/' + id)`
 * would drag every effect into one chunk.
 *
 * Mirrors hugmesh-host-shell's src/app/background/vanta-effects.ts — diff against
 * that copy before changing anything here.
 */

export type BackgroundEffectId = 'fog' | 'net' | 'waves' | 'globe';

export interface VantaInstance {
  setOptions?(options: Record<string, unknown>): void;
  destroy(): void;
}

export interface LoadedVantaEffect {
  readonly factory: (options: Record<string, unknown>) => VantaInstance;
  readonly three: unknown;
}

/** The seam a spec substitutes, so background.component.spec.ts can drive the
 *  whole lifecycle without a GPU and without pulling three.js into the karma
 *  bundle. */
export type VantaEffectLoader = (id: BackgroundEffectId) => Promise<LoadedVantaEffect>;

const EFFECT_IMPORTS: Readonly<Record<BackgroundEffectId, () => Promise<{ default: unknown }>>> = {
  fog: () => import('vanta/dist/vanta.fog.min'),
  net: () => import('vanta/dist/vanta.net.min'),
  waves: () => import('vanta/dist/vanta.waves.min'),
  globe: () => import('vanta/dist/vanta.globe.min'),
};

/** Fetch three.js and one effect in parallel; both land in the module cache, so a
 *  later effect switch costs one small chunk and no second three.js. */
export const loadVantaEffect: VantaEffectLoader = async (id) => {
  const [three, effect] = await Promise.all([import('three'), EFFECT_IMPORTS[id]()]);
  return { three, factory: effect.default as LoadedVantaEffect['factory'] };
};

/**
 * Whether this browser can run any of it.
 *
 * Probed BEFORE the loader, never after: a machine with WebGL disabled by policy
 * would otherwise download the whole payload to discover Vanta's init fails. The
 * call is wrapped because such a browser can THROW from getContext rather than
 * return null.
 */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

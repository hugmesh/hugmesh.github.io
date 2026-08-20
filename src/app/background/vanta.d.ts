// Vanta ships no types. Each effect module default-exports a factory taking an
// options bag and returning an instance with destroy()/setOptions().
declare module 'vanta/dist/vanta.fog.min' {
  const effect: (options: Record<string, unknown>) => {
    destroy(): void;
    setOptions?(options: Record<string, unknown>): void;
  };
  export default effect;
}
declare module 'vanta/dist/vanta.net.min' {
  const effect: (options: Record<string, unknown>) => {
    destroy(): void;
    setOptions?(options: Record<string, unknown>): void;
  };
  export default effect;
}
declare module 'vanta/dist/vanta.waves.min' {
  const effect: (options: Record<string, unknown>) => {
    destroy(): void;
    setOptions?(options: Record<string, unknown>): void;
  };
  export default effect;
}
declare module 'vanta/dist/vanta.globe.min' {
  const effect: (options: Record<string, unknown>) => {
    destroy(): void;
    setOptions?(options: Record<string, unknown>): void;
  };
  export default effect;
}

// three.js is only ever handled as an OPAQUE module namespace here: it is loaded
// dynamically and handed straight to Vanta's `THREE` injection point, and no
// symbol from it is referenced by name. Declaring the module is therefore enough,
// and pulling in @types/three would add a large dev dependency to type a value
// this codebase deliberately treats as `unknown`.
declare module 'three';

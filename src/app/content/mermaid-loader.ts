import type { Mermaid } from 'mermaid';

/**
 * Lazy, one-shot mermaid loader.
 *
 * mermaid is ~500 KB. Most pages have no diagram, so it must never be part of the
 * initial bundle — the dynamic import below is what lets esbuild split it into
 * its own chunk, and the promise is memoised so a page with six diagrams fetches
 * it once.
 */
let pending: Promise<Mermaid> | undefined;

export function loadMermaid(): Promise<Mermaid> {
  pending ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      // securityLevel 'strict' makes mermaid sanitise labels and refuse
      // click-handler directives. Diagram sources come from documentation the
      // repo controls, but the setting costs nothing and removes the question.
      securityLevel: 'strict',
      theme: 'dark',
      themeVariables: {
        background: '#1a1a2e',
        primaryColor: '#12121e',
        primaryTextColor: '#e8e8e8',
        primaryBorderColor: '#7c4dff',
        lineColor: '#a8acc4',
        secondaryColor: '#2a2a3e',
        tertiaryColor: '#1a1a2e',
        fontFamily: 'Arial, Helvetica, sans-serif',
      },
    });
    return mermaid;
  });
  return pending;
}

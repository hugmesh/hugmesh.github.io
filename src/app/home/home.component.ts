import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ContentService } from '../content/content.service';
import { SECTIONS } from '../content/sections';
import { PlatformRailComponent } from '../shared/platform-rail.component';

/** One of the services a mesh stands up — "world" is reserved for the mesh
 *  itself, the whole world it hosts for its people. Pastels key the cards;
 *  every one is AAA against --hug-bg-0 (measured, not assumed — _tokens.scss). */
interface MeshService {
  readonly name: string;
  readonly blurb: string;
  readonly accent: string;
  /** An SVG path, stroked in the world's accent. A tinted square with nothing in
   *  it reads as a loading placeholder — measured at 16% tint it was simply grey. */
  readonly icon: string;
  /** Where the docs explain it. */
  readonly route: string;
}

/**
 * The front door.
 *
 * WHAT THIS PAGE IS FOR. A visitor who has never heard of HugMesh should learn
 * what it makes, see that it runs on their machine, and leave with the Studio —
 * in that order, without scrolling to find any of it. Everything else on the
 * page is subordinate to that.
 *
 * WHAT IT MUST NOT DO. Promise a download that does not exist. No release is
 * published yet, so the platform rail leads with the install path that actually
 * works today and says plainly when a packaged build is not available. The
 * moment `assets/releases.json` carries an installer for a platform, that
 * platform's rail becomes a real download with no change here.
 */
@Component({
  selector: 'hug-home',
  imports: [RouterLink, PlatformRailComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private readonly content = inject(ContentService);

  readonly sections = SECTIONS;
  readonly indexFailed = this.content.indexFailed;

  // ── the services ──────────────────────────────────────────────────────────
  readonly services: readonly MeshService[] = [
    {
      name: 'Chat',
      icon: 'M20 12.4c0 3.9-3.6 7-8 7a9 9 0 0 1-2.6-.4L5 20.5l1.2-3.4A6.6 6.6 0 0 1 4 12.4c0-3.9 3.6-7 8-7s8 3.1 8 7Z',
      blurb: 'Matrix, end-to-end encrypted, federating with the wider network.',
      accent: '#ffc8dd',
      route: '/architecture',
    },
    {
      name: 'Fediverse',
      icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
      blurb: 'An Akkoma instance under your domain, following anyone on the fediverse.',
      accent: '#bde0fe',
      route: '/architecture',
    },
    {
      name: 'Wiki',
      icon: 'M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13ZM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5v-13Z',
      blurb: 'A shared wiki, versioned, behind the same single sign-on as everything else.',
      accent: '#caffbf',
      route: '/architecture',
    },
    {
      name: 'Forum',
      icon: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h10A1.5 1.5 0 0 1 17 6.5v6A1.5 1.5 0 0 1 15.5 14H9l-4 3.5V14H5.5A1.5 1.5 0 0 1 4 12.5v-6ZM20 9.5v6A1.5 1.5 0 0 1 18.5 17H18v3l-3.5-3',
      blurb: 'Threaded discussion for the conversations chat is the wrong shape for.',
      accent: '#d0b4f5',
      route: '/architecture',
    },
    {
      name: 'Video',
      icon: 'M4 7.5A1.5 1.5 0 0 1 5.5 6h9A1.5 1.5 0 0 1 16 7.5v9A1.5 1.5 0 0 1 14.5 18h-9A1.5 1.5 0 0 1 4 16.5v-9ZM16 10.5l4-2.5v8l-4-2.5',
      blurb: 'Upload, transcode and stream — plus live broadcast when you want it.',
      accent: '#ffd6a5',
      route: '/architecture',
    },
    {
      name: 'Games',
      icon: 'M7.5 8.5h9A3.5 3.5 0 0 1 20 12v3.5A2.5 2.5 0 0 1 17.5 18c-1.2 0-1.8-.7-2.5-1.5h-6C8.3 17.3 7.7 18 6.5 18A2.5 2.5 0 0 1 4 15.5V12a3.5 3.5 0 0 1 3.5-3.5ZM8 11.5v3M6.5 13h3M15.5 12h.01M17.5 14h.01',
      blurb: 'A Godot studio in the browser: build worlds, publish them, play together.',
      accent: '#fdffb6',
      route: '/games',
    },
  ];

  /** The source-repository grid carried over from the original static landing page.
   *  The org is `hugmesh` — the old page linked `github.com/hugmesh-net`, which is
   *  not a GitHub account at all, so every one of those links 404'd. */
  readonly repos = [
    { name: 'hugmesh-generator', blurb: 'OS image builds, GitOps manifests, first-boot provisioning' },
    { name: 'hugmesh-gateway', blurb: 'Spring Cloud Gateway — JWT validation, route-access enforcement' },
    { name: 'hugmesh-commons', blurb: 'Shared auth/tenancy library consumed by every BFF' },
    { name: 'hugmesh-admin-bff-api', blurb: 'Admin control plane — allowlists, sessions, service catalog' },
    { name: 'hugmesh-user-bff-api', blurb: 'Owner-scoped user profile, preferences, federation cards' },
    { name: 'hugmesh-matrix-ui', blurb: 'Matrix chat remote' },
    { name: 'hugmesh-mastodon-ui', blurb: 'Fediverse remote (Akkoma)' },
    { name: 'hugmesh-games', blurb: 'Godot 4 WASM game studio, SSE multiplayer, RPG & VN authoring' },
  ];

  private readonly index = toSignal(this.content.index());

  /** Page counts per section, so a section card can say how much is behind it
   *  instead of making the reader click to find out. */
  readonly counts = computed(() => {
    const map = new Map<string, number>();
    for (const s of this.index()?.sections ?? []) map.set(s.id, s.docs.length);
    return map;
  });

  readonly totalPages = computed(() => this.index()?.totals.pages ?? 0);

  /** Diagrams across the whole corpus. Derived from the index rather than typed
   *  in, because a hand-written number on the front door goes stale silently —
   *  build-content.mjs counts them at render time. */
  readonly totalDiagrams = computed(() => this.index()?.totals.diagrams ?? 0);

  /** The first few tutorials, in curriculum order — the "start here" path. */
  readonly firstSteps = computed(
    () => this.index()?.sections.find((s) => s.id === 'tutorials')?.docs.slice(0, 4) ?? [],
  );
}

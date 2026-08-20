import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ContentService } from '../content/content.service';
import { SECTIONS } from '../content/sections';

/**
 * The documentation home page.
 *
 * It keeps the hero and positioning copy from the original static landing page —
 * that copy was the site, and losing it in a rewrite would have been a
 * regression — and adds what a documentation front door needs: a way into every
 * section, and the shortest path to actually doing something.
 */
@Component({
  selector: 'hug-home',
  imports: [RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private readonly content = inject(ContentService);

  readonly sections = SECTIONS;
  readonly indexFailed = this.content.indexFailed;

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

  /** The first few tutorials, in curriculum order — the "start here" path. */
  readonly firstSteps = computed(
    () => this.index()?.sections.find((s) => s.id === 'tutorials')?.docs.slice(0, 4) ?? [],
  );
}

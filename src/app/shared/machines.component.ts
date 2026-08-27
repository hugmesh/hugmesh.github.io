import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

/** One slide: either an inline diagram (drawn in the template) or a capture. */
export interface MachineSlide {
  readonly id: 'topology' | 'provisioning' | 'login' | 'chat' | 'fediverse';
  /** Read under the controls; also the accessible name of the slide's dot. */
  readonly caption: string;
  /** Set only on capture slides; diagram slides render inline SVG instead. */
  readonly src?: string;
  readonly alt?: string;
}

/**
 * "Five machines. One world." — the hardware story, as a slideshow.
 *
 * Two diagrams and three captures. The diagrams are drawn here rather than
 * shipped as images so they stay text: greppable, themeable, and honest about
 * being diagrams. The captures are the opposite — real screenshots of the real
 * software (the login page live from a running mesh, and the Matrix and Akkoma
 * services as the e2e suite photographed them), because a drawn "screenshot"
 * would be a claim the product has to make good on pixel by pixel.
 *
 * No autoplay. A slideshow that advances itself steals the reader's place;
 * this one moves only when asked, wraps at both ends, and names every dot.
 */
@Component({
  selector: 'hug-machines',
  templateUrl: './machines.component.html',
  styleUrl: './machines.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MachinesComponent {
  readonly slides: readonly MachineSlide[] = [
    {
      id: 'topology',
      caption: 'Redrawn from the cluster architecture diagram — one of the diagrams in the docs.',
    },
    {
      id: 'provisioning',
      caption: 'From blank cards to a running world. The Studio writes; first boot does the rest.',
    },
    {
      id: 'login',
      caption: 'The front door — captured live from a running mesh.',
      src: 'assets/img/captures/shot-login.jpg',
      alt: 'The sign-in page of a running mesh: a HugMesh wordmark over a pastel gradient, with username and password fields',
    },
    {
      id: 'chat',
      caption: 'Three people in a Matrix room. An e2e-suite capture.',
      src: 'assets/img/captures/shot-matrix-group.jpg',
      alt: 'A three-member Matrix group room with messages from each member and a members panel',
    },
    {
      id: 'fediverse',
      caption: 'The fediverse under your domain. An e2e-suite capture.',
      src: 'assets/img/captures/shot-mastodon.jpg',
      alt: 'The Akkoma home timeline with a compose box and a published post',
    },
  ];

  private readonly index = signal(0);

  readonly current = computed(() => this.slides[this.index()]);
  readonly counter = computed(() => `${this.index() + 1} / ${this.slides.length}`);

  isCurrent(i: number): boolean {
    return this.index() === i;
  }

  go(i: number): void {
    this.index.set(i);
  }

  next(): void {
    this.index.update((i) => (i + 1) % this.slides.length);
  }

  prev(): void {
    this.index.update((i) => (i - 1 + this.slides.length) % this.slides.length);
  }
}

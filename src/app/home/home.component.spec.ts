import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { HomeComponent } from './home.component';
import { ContentService } from '../content/content.service';
import { ContentIndex } from '../content/content.models';
import manifest from '../../../docs.manifest.json';

/**
 * The Start here steps on the home page show each page's real title and summary.
 * The text comes from docs.manifest.json, so this spec reads that file: a short
 * made-up summary would fit any box and prove nothing.
 */
const tutorials = manifest.sections.tutorials;
const index: ContentIndex = {
  generatedFrom: 'docs.manifest.json',
  sectionOrder: ['tutorials'],
  sections: [
    {
      id: 'tutorials',
      title: 'Get started',
      blurb: '',
      groups: tutorials.groups.map((g) => ({ id: g.id, title: g.title, blurb: null, routes: g.pages })),
      docs: manifest.docs
        .filter((d) => d.section === 'tutorials')
        .map((d) => ({ slug: d.slug, route: `/tutorials/${d.slug}`, title: d.title, summary: d.summary, readingMinutes: 1 })),
    },
  ],
  totals: { sections: 1, pages: 0 },
};

describe('HomeComponent', () => {
  let fixture: ComponentFixture<HomeComponent>;
  /** Karma runs the specs in an iframe; its width is the viewport the page sees. */
  const frame = window.frameElement as HTMLElement | null;
  const frameWidth = frame?.style.width ?? '';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ContentService, useValue: { index: () => of(index), indexFailed: signal(false) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    if (frame) frame.style.width = frameWidth;
    fixture.nativeElement.style.width = '';
  });

  const steps = () => Array.from(fixture.nativeElement.querySelectorAll('.steps a')) as HTMLElement[];

  it('shows the Get started steps in order, starting with the download', () => {
    const main = tutorials.groups.find((g) => g.id === 'main')!;
    expect(steps().map((a) => a.getAttribute('href'))).toEqual(main.pages);
    expect(steps().length).toBe(4);
  });

  it('shows each step summary whole, as the manifest has it', () => {
    const summaries = steps().map((a) => a.querySelector('em')!.textContent!.trim());
    const startHere = manifest.docs.find((d) => d.section === 'tutorials' && d.slug === 'start-here')!;
    expect(summaries[1]).toBe(startHere.summary);
  });

  // The summary was once clamped to three lines, which cut step 2 off in the middle
  // of a sentence at every one of these widths. Nothing in a step may be taller
  // than the box that holds it.
  for (const width of [1280, 1440, 900, 600]) {
    it(`cuts off no step title or summary at ${width}px wide`, () => {
      if (frame) {
        frame.style.width = `${width}px`;
        expect(window.innerWidth).withContext('the spec frame took the width').toBe(width);
      } else {
        // No frame to resize (a debug tab): narrow the page instead. The step grid
        // sizes itself from its container, so the wrap is the same.
        fixture.nativeElement.style.width = `${width}px`;
      }
      const texts = steps().flatMap((a) => Array.from(a.querySelectorAll('strong, em')) as HTMLElement[]);
      expect(texts.length).toBe(8);
      for (const el of texts) {
        const label = `"${el.textContent!.trim().slice(0, 40)}" at ${width}px`;
        expect(el.clientHeight).withContext(`${label} has a box`).toBeGreaterThan(0);
        expect(el.scrollHeight).withContext(`${label}: scrollHeight <= clientHeight`).toBeLessThanOrEqual(el.clientHeight);
        expect(el.scrollWidth).withContext(`${label}: scrollWidth <= clientWidth`).toBeLessThanOrEqual(el.clientWidth);
      }
      for (const a of steps()) {
        expect(a.scrollHeight).withContext(`step box at ${width}px`).toBeLessThanOrEqual(a.clientHeight);
      }
    });
  }
});

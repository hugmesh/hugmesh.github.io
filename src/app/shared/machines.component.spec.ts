import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MachinesComponent } from './machines.component';

describe('MachinesComponent', () => {
  let fixture: ComponentFixture<MachinesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MachinesComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MachinesComponent);
    fixture.detectChanges();
  });

  const el = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement;
  const all = (sel: string) => fixture.nativeElement.querySelectorAll(sel);

  it('opens on the topology diagram, not on a capture', () => {
    expect(el('.stage svg')).toBeTruthy();
    expect(el('.stage img')).toBeNull();
    expect(el('figcaption').textContent).toContain('cluster architecture');
  });

  it('renders one named dot per slide, with the current one marked', () => {
    const dots = all('.dot');
    expect(dots.length).toBe(fixture.componentInstance.slides.length);
    expect(dots[0].getAttribute('aria-current')).toBe('true');
    expect(dots[1].getAttribute('aria-current')).toBeNull();
    for (const dot of Array.from(dots) as HTMLElement[]) {
      expect(dot.getAttribute('aria-label')).toMatch(/^Slide \d of \d: ./);
    }
  });

  it('advances to the capture slides and shows a real image with alt text', () => {
    const c = fixture.componentInstance;
    c.go(2); // login
    fixture.detectChanges();
    const img = el('.stage img') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('assets/img/captures/shot-login.jpg');
    expect(img.getAttribute('alt')).toBeTruthy();
    expect(el('figcaption').textContent).toContain('running mesh');
  });

  it('wraps at both ends instead of dead-ending', () => {
    const c = fixture.componentInstance;
    c.prev();
    expect(c.counter()).toBe(`${c.slides.length} / ${c.slides.length}`);
    c.next();
    expect(c.counter()).toBe(`1 / ${c.slides.length}`);
  });

  it('gives every capture slide a src and an alt, and the diagrams neither', () => {
    for (const s of fixture.componentInstance.slides) {
      const isDiagram = s.id === 'topology' || s.id === 'provisioning';
      if (isDiagram) {
        expect(s.src).withContext(`${s.id} src`).toBeUndefined();
      } else {
        expect(s.src).withContext(`${s.id} src`).toMatch(/^assets\/img\/captures\//);
        expect(s.alt?.trim()).withContext(`${s.id} alt`).toBeTruthy();
      }
    }
  });
});

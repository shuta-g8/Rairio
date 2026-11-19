import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { LOGO_MOTION } from './timing';
import { LOGO_LAYOUT, SYMBOL_ROUTES } from './geometry';

gsap.registerPlugin(CustomEase);
const sweepEase = CustomEase.create('rairio-symbol-sweep', LOGO_MOTION.ease);
// Preserve the opening; smoothly compress only the final part of the stroke.
const drawEase = (progress: number) => {
  const elapsed = progress * LOGO_MOTION.drawDuration;
  const tail = Math.max(
    0,
    Math.min(
      1,
      (elapsed - LOGO_MOTION.drawTailAt) / (LOGO_MOTION.drawDuration - LOGO_MOTION.drawTailAt),
    ),
  );
  const reference =
    elapsed +
    (LOGO_MOTION.drawReferenceDuration - LOGO_MOTION.drawDuration) * tail * tail * (3 - 2 * tail);
  return sweepEase(reference / LOGO_MOTION.drawReferenceDuration);
};

export interface TimelineOptions {
  duration: number;
  delay: number;
  onComplete: () => void;
}

export function createLogoTimeline(svg: SVGSVGElement, options: TimelineOptions) {
  const find = (selector: string) => {
    const element = svg.querySelector(selector);
    if (!element) throw new Error(`Missing logo element: ${selector}`);
    return element;
  };
  const symbol = find('[data-symbol-position]');
  const occluder = find('[data-word-occluder]');
  const wordmark = find('[data-wordmark]');
  const edition = find('[data-logo-edition]');
  const editionStage = find('[data-edition-stage]');
  const paths = SYMBOL_ROUTES.map((route) => {
    const path = svg.querySelector<SVGPathElement>(`[data-symbol-trace="${route.part}"]`);
    if (!path) throw new Error(`Missing symbol route: ${route.part}`);
    return path;
  });
  const lengths = paths.map((path) => path.getTotalLength());
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const cursor = { distance: 0 };
  const closing = { intensity: 0 };
  const tip = find('[data-symbol-tip]');
  const tipDepth = find('[data-tip-depth]');
  const tipSurfaces = svg.querySelectorAll<SVGGElement>('[data-tip-surface]');
  const tipPlanes = svg.querySelectorAll<SVGGElement>('[data-tip-plane], [data-tip-atmosphere]');
  const flash = find('[data-symbol-flash]');
  const glows = svg.querySelectorAll<SVGElement>('[data-symbol-glow-base]');
  const render = () => {
    let start = 0;
    let tipPoint = paths[0].getPointAtLength(0);
    let angle = 0;
    let activeLayer = 'rear';
    let behindCrossing = false;
    paths.forEach((path, index) => {
      const length = lengths[index];
      if (cursor.distance >= start) {
        const distance = Math.max(0, Math.min(length, cursor.distance - start));
        tipPoint = path.getPointAtLength(distance);
        const before = path.getPointAtLength(Math.max(0, distance - 0.5));
        const after = path.getPointAtLength(Math.min(length, distance + 0.5));
        angle = (Math.atan2(after.y - before.y, after.x - before.x) * 180) / Math.PI;
        activeLayer = index === 1 ? 'front' : 'rear';
        // The right-hand bend is continuous, not an overlap. Enable the
        // front ribbon's occlusion only after leaving that bend, before
        // the light reaches the actual crossing.
        behindCrossing = index === 2 && tipPoint.x < 810;
      }
      path.style.visibility = cursor.distance > start ? 'visible' : 'hidden';
      path.style.strokeDashoffset = String(
        length - Math.max(0, Math.min(length, cursor.distance - start)),
      );
      start += length;
    });
    tipSurfaces.forEach((surface) => {
      surface.style.visibility = surface.dataset.tipSurface === activeLayer ? 'visible' : 'hidden';
    });
    // Apply depth AFTER blurring: otherwise the glow bleeds over the front ribbon.
    tipDepth.setAttribute(
      'clip-path',
      behindCrossing ? tipDepth.getAttribute('data-back-mask')! : 'none',
    );
    tipPlanes.forEach((plane) =>
      plane.setAttribute('transform', `translate(${tipPoint.x} ${tipPoint.y}) rotate(${angle})`),
    );
    tip.setAttribute(
      'opacity',
      String(Math.max(0, Math.min(1, cursor.distance / 12, (total - cursor.distance) / 22))),
    );
    flash.setAttribute('flood-opacity', String(closing.intensity * 0.9));
    const light =
      1 + Math.sin((Math.PI * cursor.distance) / total) * 0.14 + closing.intensity * 0.55;
    glows.forEach((element) => {
      element.setAttribute(
        'flood-opacity',
        String(Math.min(1, Number(element.dataset.symbolGlowBase) * light)),
      );
    });
  };
  paths.forEach((path, index) => {
    path.style.strokeDasharray = lengths[index] + ' ' + lengths[index];
  });
  render();
  gsap.set(svg, { visibility: 'visible' });
  gsap.set([symbol, occluder], { x: LOGO_LAYOUT.symbolStartOffset });
  gsap.set(wordmark, { x: -48, y: LOGO_LAYOUT.wordStartY, autoAlpha: 0 });
  gsap.set(edition, { y: 0, autoAlpha: 0 });
  gsap.set(editionStage, { opacity: 0 });
  const timeline = gsap
    .timeline({
      paused: true,
      delay: options.delay,
      onStart: () => {
        svg.dataset.state = 'playing';
      },
      onComplete: options.onComplete,
    })
    .fromTo(
      cursor,
      { distance: 0 },
      {
        distance: total,
        duration: LOGO_MOTION.drawDuration,
        ease: drawEase,
        onUpdate: render,
        onComplete: () => {
          cursor.distance = total;
          render();
        },
      },
      0,
    )
    .fromTo(
      closing,
      { intensity: 0 },
      { intensity: 1, duration: 0.08, ease: 'sine.out', onUpdate: render },
      LOGO_MOTION.drawDuration - 0.08,
    )
    .to(
      closing,
      { intensity: 0, duration: 0.65, ease: 'sine.inOut', onUpdate: render },
      LOGO_MOTION.drawDuration,
    )
    .addLabel('assemble', LOGO_MOTION.shiftAt)
    .to(
      [symbol, occluder],
      {
        x: 0,
        duration: LOGO_MOTION.shiftDuration,
        ease: 'power2.inOut',
      },
      'assemble',
    )
    .to(
      wordmark,
      { x: 0, autoAlpha: 1, duration: LOGO_MOTION.wordDuration, ease: 'power2.out' },
      LOGO_MOTION.wordAt,
    )
    .addLabel('lift', LOGO_MOTION.liftAt)
    .to(wordmark, { y: 0, duration: LOGO_MOTION.liftDuration, ease: 'power2.inOut' }, 'lift')
    .set(editionStage, { opacity: 1, immediateRender: false }, LOGO_MOTION.editionAt)
    .to(
      edition,
      { autoAlpha: 1, duration: LOGO_MOTION.editionDuration, ease: 'sine.inOut' },
      LOGO_MOTION.editionAt,
    )
    .to(
      {},
      { duration: LOGO_MOTION.duration - LOGO_MOTION.editionAt - LOGO_MOTION.editionDuration },
      LOGO_MOTION.editionAt + LOGO_MOTION.editionDuration,
    );
  timeline.timeScale(LOGO_MOTION.duration / options.duration);
  return timeline;
}

export function showFinalLogo(svg: SVGSVGElement) {
  svg.querySelector('[data-symbol-tip]')?.setAttribute('opacity', '0');
  svg.querySelector('[data-symbol-flash]')?.setAttribute('flood-opacity', '0');
  gsap.set(svg, { visibility: 'visible' });
  gsap.set(svg.querySelector('[data-symbol-position]'), { x: 0 });
  gsap.set(svg.querySelector('[data-word-occluder]'), { x: 0 });
  gsap.set(svg.querySelector('[data-wordmark]'), { x: 0, y: 0, autoAlpha: 1 });
  gsap.set(svg.querySelector('[data-logo-edition]'), { y: 0, autoAlpha: 1 });
  gsap.set(svg.querySelector('[data-edition-stage]'), { opacity: 1 });
  svg.querySelectorAll<SVGPathElement>('[data-symbol-trace]').forEach((path) => {
    path.style.strokeDasharray = 'none';
    path.style.strokeDashoffset = '0';
    path.style.visibility = 'visible';
  });
  svg.dataset.state = 'complete';
  svg.querySelectorAll<SVGElement>('[data-symbol-glow-base]').forEach((element) => {
    element.setAttribute('flood-opacity', element.dataset.symbolGlowBase ?? '0');
  });
}

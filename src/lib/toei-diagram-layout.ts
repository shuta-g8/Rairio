import { toeiEnglishStopWeight } from './toei-diagram';

const ROTATED_LABEL_COS = 0.5;
const ROTATED_LABEL_SIN = Math.sin(Math.PI / 3);
const ROTATED_LABEL_SLOPE = Math.tan(Math.PI / 6);
const ENGLISH_WRAP_THRESHOLD = 0.65;

function fitCurrentCut(cells: HTMLElement[]) {
  const index = cells.findIndex((cell) => cell.dataset.kind === 'current');
  const cell = cells[index];
  const cut = cell?.querySelector<HTMLElement>('.toei-stop-cut');
  const next = cells[index + 1];
  if (!cut || !next) return;
  const node = (element: HTMLElement) =>
    element.querySelector('.toei-stop-code, .toei-stop-dash')!.getBoundingClientRect();
  const currentNode = node(cell);
  const nextNode = node(next);
  const center =
    (currentNode.left + currentNode.width / 2 + nextNode.left + nextNode.width / 2) / 2;
  cut.style.setProperty(
    '--toei-current-cut-center',
    `${center - cell.getBoundingClientRect().left}px`,
  );
}

function fitHorizontalText(root: HTMLElement, selector: string, property: string) {
  const measurements = [...root.querySelectorAll<HTMLElement>(selector)].map((text) => {
    const available = text.parentElement!.clientWidth;
    const natural = text.scrollWidth;
    return { text, available, natural };
  });
  for (const { text, available, natural } of measurements) {
    if (available > 0 && natural > 0)
      text.style.setProperty(property, String(Math.min(1, available / natural)));
  }
}

/** Pack Japanese transfer columns against the station, rather than stretching both equally. */
function fitTransferColumns(cells: HTMLElement[], unit: number) {
  const fitted: { transfers: HTMLElement; columns: string }[] = [];
  for (const cell of cells) {
    if (cell.dataset.transferColumns !== '2') continue;
    const transfers = cell.querySelector<HTMLElement>('.toei-stop-transfers');
    if (!transfers) continue;
    const rows = Number(cell.style.getPropertyValue('--toei-transfer-rows'));
    const widths = [0, 0];
    for (const [index, item] of [...transfers.children].entries()) {
      const icon = item.querySelector('.toei-transfer-symbol')!.getBoundingClientRect().width;
      const text = item.querySelector<HTMLElement>('.toei-transfer-name-text')!;
      const gap = parseFloat(getComputedStyle(item).columnGap) || 0;
      const column = Math.floor(index / rows);
      widths[column] = Math.max(widths[column], icon + gap + text.scrollWidth + 0.1 * unit);
    }
    const gap = parseFloat(getComputedStyle(transfers).columnGap) || 0;
    const available = Math.max(0, transfers.clientWidth - gap);
    const total = widths[0] + widths[1];
    const scale = total > 0 ? Math.min(1, available / total) : 1;
    fitted.push({ transfers, columns: widths.map((width) => `${width * scale}px`).join(' ') });
  }
  for (const { transfers, columns } of fitted) transfers.style.gridTemplateColumns = columns;
}

function alignJapaneseTransferText(diagram: HTMLElement) {
  const range = document.createRange();
  const offsets = [...diagram.querySelectorAll<HTMLElement>('.toei-transfer-name-text')].map(
    (text) => {
      range.selectNodeContents(text);
      const row = text.closest('li')!.getBoundingClientRect();
      return { text, offset: row.bottom - range.getBoundingClientRect().bottom };
    },
  );
  for (const { text, offset } of offsets)
    text.style.setProperty('--toei-transfer-text-offset-y', `${offset}px`);
}

function fitBranches(cells: HTMLElement[], unit: number, english: boolean) {
  const fitted: { branch: HTMLElement; left: number; width: number }[] = [];
  for (const cell of cells) {
    const branch = cell.querySelector<HTMLElement>('.toei-stop-branch');
    if (!branch) continue;
    const bounds = cell.getBoundingClientRect();
    const node = cell.querySelector('.toei-stop-code, .toei-stop-dash')!.getBoundingClientRect();
    // Browsers can round the painted border width, so measure it before centering the stroke.
    const stroke = parseFloat(getComputedStyle(branch).borderLeftWidth);
    const start = node.left + (node.width - stroke) / 2;
    const contents = [
      ...cell.querySelectorAll(
        english ? '.toei-transfer-symbol' : '.toei-transfer-symbol, .toei-transfer-name-text',
      ),
    ];
    const right =
      Math.max(...contents.map((content) => content.getBoundingClientRect().right)) + 0.15 * unit;
    const width = Math.max(1, Math.min(bounds.right - 0.15 * unit, right) - start);
    fitted.push({ branch, left: start - bounds.left, width });
  }
  for (const { branch, left, width } of fitted) {
    branch.style.setProperty('--toei-map-branch-left', `${left}px`);
    branch.style.setProperty('--toei-map-branch-width', `${width}px`);
  }
}

/** Project a line's center along its reading direction to the bottom of the name area. */
function englishLineCenter(line: DOMRect, bottom: number) {
  return line.left + line.width / 2 + ROTATED_LABEL_SLOPE * (line.top + line.height / 2 - bottom);
}

function englishNameBand(range: Range, bottom: number) {
  let left = Infinity;
  let right = -Infinity;
  for (const line of range.getClientRects()) {
    const center = englishLineCenter(line, bottom);
    // For a -60° rotation: boxWidth = w/2 + h√3/2, boxHeight = w√3/2 + h/2.
    const height = Math.max(0, Math.sqrt(3) * line.width - line.height);
    const halfWidth = height / (2 * Math.cos(Math.PI / 6));
    left = Math.min(left, center - halfWidth);
    right = Math.max(right, center + halfWidth);
  }
  if (left !== Infinity) return { left, right };
}

function englishTransferLeft(item: Element, icon: DOMRect, bottom: number) {
  const range = document.createRange();
  range.selectNodeContents(item.querySelector('.toei-transfer-name-text')!);
  const band = englishNameBand(range, bottom);
  const halfWidth = band ? (band.right - band.left) / 2 : 0;
  return icon.left + icon.width / 2 + ROTATED_LABEL_SLOPE * (icon.top - bottom) - halfWidth;
}

function fitEnglishTransferRow(
  transfers: HTMLElement,
  cellRight: number,
  unit: number,
  nameEdge: { x: number; y: number },
) {
  const first = transfers.firstElementChild!;
  const icon = first.querySelector('.toei-transfer-symbol')!.getBoundingClientRect();
  const count = transfers.childElementCount;
  const available = cellRight - 0.3 * unit - transfers.getBoundingClientRect().left;
  const free = Math.max(0, available - count * icon.width);
  const nameRight = nameEdge.x + ROTATED_LABEL_SLOPE * (nameEdge.y - icon.top);
  const firstLeft = Math.min(icon.left, englishTransferLeft(first, icon, icon.top));
  const clearance = Math.max(0.5, 0.08 * unit);
  const shift = Math.min(free, Math.max(0, nameRight + clearance - firstLeft));
  transfers.style.setProperty('--toei-english-transfer-shift', `${shift}px`);
  if (count > 1) transfers.style.gap = `${Math.min(0.35 * unit, (free - shift) / (count - 1))}px`;
}

/** Keep each rotated label inside its own station column and above the route bar. */
function fitEnglishStops(
  root: HTMLElement,
  diagram: HTMLElement,
  cells: HTMLElement[],
  unit: number,
) {
  const widths = cells.map((cell) => {
    const count = Number(cell.dataset.transferCount);
    return `${toeiEnglishStopWeight(count)}fr`;
  });
  if (diagram.querySelector('.toei-stop-continuation'))
    widths.push('var(--toei-continuation-width, 18fr)');
  diagram.style.setProperty('--toei-fitted-columns', widths.join(' '));
  fitEnglishLabels(root, cells, unit);
  fitBranches(cells, unit, true);
}

/** Preserve a single line unless wrapping materially improves its horizontal scale. */
function fitEnglishText(text: HTMLElement, property: string, availableWidth: () => number) {
  const naturalWidth = text.scrollWidth;
  if (!naturalWidth) return;
  const singleLine = Math.min(1, availableWidth() / naturalWidth);
  let scale = singleLine;
  if (singleLine < ENGLISH_WRAP_THRESHOLD) {
    text.dataset.twoLines = '';
    const lineHeight = parseFloat(getComputedStyle(text).lineHeight);
    // Try a balanced width first, then allow room for longer words and hyphenated names.
    for (const share of [0.58, 0.72, 0.86]) {
      text.style.setProperty('--toei-english-wrap-width', `${Math.ceil(naturalWidth * share)}px`);
      if (Math.abs(text.offsetHeight - 2 * lineHeight) > 1) continue;
      const wrapped = Math.min(1, availableWidth() / text.scrollWidth);
      if (wrapped > singleLine) scale = wrapped;
      break;
    }
    if (scale === singleLine) {
      delete text.dataset.twoLines;
      text.style.removeProperty('--toei-english-wrap-width');
      availableWidth();
    }
  }
  text.style.setProperty(property, String(scale));
}

function fitEnglishLabels(root: HTMLElement, cells: HTMLElement[], unit: number) {
  const map = root.getBoundingClientRect();
  const labelCells = [
    ...cells,
    ...root.querySelectorAll<HTMLElement>('.toei-meguro-station, .toei-meguro-line'),
  ];
  for (const cell of labelCells) {
    const bounds = cell.getBoundingClientRect();
    const background = cell.querySelector<HTMLElement>('.toei-stop-current-background');
    const transfers = cell.querySelector<HTMLElement>('.toei-stop-transfers');
    let previousAnchor: { x: number; y: number } | undefined;
    for (const label of cell.querySelectorAll<HTMLElement>(
      '.toei-stop-name, .toei-transfer-name',
    )) {
      const text = label.firstElementChild as HTMLElement;
      const stationName = label.classList.contains('toei-stop-name');
      const property = stationName ? '--toei-stop-text-x' : '--toei-transfer-text-x';
      const node = stationName
        ? cell.querySelector('.toei-stop-code, .toei-stop-dash')?.getBoundingClientRect()
        : label.parentElement!.querySelector('.toei-transfer-symbol')!.getBoundingClientRect();
      const range = node ? document.createRange() : undefined;
      range?.selectNodeContents(text);
      const bottom = stationName ? label.parentElement!.getBoundingClientRect().bottom : node!.top;
      const center = node ? node.left + node.width / 2 : 0;
      const base = label.getBoundingClientRect();
      const x = base.left + parseFloat(getComputedStyle(label).height) * ROTATED_LABEL_SIN;
      const y = base.bottom;
      const top = Math.max(map.top + 0.2 * unit, bounds.top + 0.15 * unit);
      let shift = 0;
      fitEnglishText(text, property, () => {
        label.style.removeProperty('--toei-english-label-width');
        if (range) label.style.removeProperty('--toei-english-label-shift');
        const height = parseFloat(getComputedStyle(label).height);
        const left = bounds.left - (x - height * ROTATED_LABEL_SIN);
        const firstLine = range?.getClientRects()[0];
        const transferBand = !stationName && range ? englishNameBand(range, bottom) : undefined;
        const axis = transferBand
          ? (transferBand.left + transferBand.right) / 2
          : firstLine && englishLineCenter(firstLine, bottom);
        shift = axis === undefined ? Math.max(0, left) : center - axis;
        if (transferBand && text.hasAttribute('data-two-lines')) {
          // A wrapped route must leave room for the previous band and the next icon's single line.
          const previousRight = previousAnchor
            ? previousAnchor.x + ROTATED_LABEL_SLOPE * (previousAnchor.y - bottom)
            : -Infinity;
          const next = label.parentElement!.nextElementSibling;
          const nextIcon = next?.querySelector('.toei-transfer-symbol')?.getBoundingClientRect();
          const nextLeft =
            next && nextIcon ? englishTransferLeft(next, nextIcon, bottom) : Infinity;
          const clearance = 0.02 * unit;
          if (
            transferBand.left + shift < previousRight + clearance ||
            transferBand.right + shift > nextLeft - clearance
          )
            return 0;
        }
        label.style.setProperty('--toei-english-label-shift', `${shift}px`);
        const width = Math.max(
          1,
          Math.min(
            label.clientWidth,
            (bounds.right - 0.2 * unit - x - shift) / ROTATED_LABEL_COS,
            (y - top - height * ROTATED_LABEL_COS) / ROTATED_LABEL_SIN,
          ),
        );
        label.style.setProperty('--toei-english-label-width', `${width}px`);
        return width;
      });
      previousAnchor = { x: x + shift, y };
      const band = range && englishNameBand(range, bottom);
      if (band) previousAnchor = { x: band.right, y: bottom };
      if (stationName) {
        if (band && background) {
          const padding = 0.12 * unit;
          background.style.setProperty(
            '--toei-current-english-left',
            `${band.left - bounds.left - padding}px`,
          );
          background.style.setProperty(
            '--toei-current-english-width',
            `${band.right - band.left + 2 * padding}px`,
          );
          previousAnchor = { x: band.right + padding, y: bottom };
        }
        if (transfers) fitEnglishTransferRow(transfers, bounds.right, unit, previousAnchor);
      }
    }
  }
  for (const text of root.querySelectorAll<HTMLElement>('.toei-continuation-text')) {
    fitEnglishText(text, '--toei-continuation-text-x', () => text.parentElement!.clientWidth);
  }
}

function resetEnglishLabels(diagram: HTMLElement) {
  for (const label of diagram.querySelectorAll<HTMLElement>(
    '.toei-stop-name, .toei-transfer-name',
  )) {
    label.style.removeProperty('--toei-english-label-width');
    label.style.removeProperty('--toei-english-label-shift');
  }
  for (const text of diagram.querySelectorAll<HTMLElement>(
    '.toei-stop-name-text, .toei-transfer-name-text, .toei-continuation-text',
  )) {
    delete text.dataset.twoLines;
    for (const property of [
      '--toei-english-wrap-width',
      '--toei-stop-text-x',
      '--toei-transfer-text-x',
      '--toei-transfer-text-offset-y',
      '--toei-continuation-text-x',
    ]) {
      text.style.removeProperty(property);
    }
  }
}

/** Measure every station name before applying character sizes to the diagram. */
function fitJapaneseNames(cells: HTMLElement[], unit: number) {
  const slots = cells.map((cell) => {
    const name = cell.querySelector<HTMLElement>('.toei-stop-name')!;
    // WebKit can resolve a vertical flex child's percentage height against the viewport.
    const height = name.parentElement!.getBoundingClientRect().height;
    const width = Math.max(1, Math.min(1.8 * unit, cell.clientWidth - 0.6 * unit));
    return { cell, name, height, width };
  });
  for (const { cell, name, height, width } of slots) {
    name.style.height = `${height}px`;
    cell.style.setProperty('--toei-stop-name-width', `${width}px`);
  }
  const range = document.createRange();
  const names = slots.map(({ name }) => {
    const text = name.querySelector<HTMLElement>('.toei-stop-name-text')!;
    const available = name.getBoundingClientRect();
    let naturalHeight = 0;
    let naturalWidth = 0;
    const characters = [...text.querySelectorAll<HTMLElement>('.toei-stop-character')].map(
      (character) => {
        const glyph = character.querySelector<HTMLElement>('.toei-stop-glyph')!;
        range.selectNodeContents(glyph);
        const bounds = range.getBoundingClientRect();
        const offset = glyph.getBoundingClientRect().top - bounds.top;
        naturalHeight += bounds.height;
        naturalWidth = Math.max(naturalWidth, bounds.width);
        return { character, glyph, height: bounds.height, offset };
      },
    );
    return { text, available, characters, naturalHeight, naturalWidth };
  });
  for (const { text, available, characters, naturalHeight, naturalWidth } of names) {
    for (const { character, glyph, height, offset } of characters) {
      character.style.height = `${height}px`;
      glyph.style.setProperty('--toei-glyph-offset-y', `${offset}px`);
    }
    if (naturalHeight <= 0 || available.height <= 0) continue;
    const scaleY = Math.min(1, available.height / naturalHeight);
    text.style.setProperty('--toei-stop-text-height', `${available.height / scaleY}px`);
    text.style.setProperty('--toei-stop-text-y', String(scaleY));
    text.style.setProperty(
      '--toei-stop-text-x',
      String(naturalWidth > 0 ? Math.min(1, available.width / naturalWidth) : 1),
    );
  }
}

function resetDiagram(diagram: HTMLElement, cells: HTMLElement[], english: boolean) {
  // Always measure natural glyphs, so a wider layout or a newly loaded font can restore full size.
  diagram.style.removeProperty('--toei-fitted-columns');
  resetEnglishLabels(diagram);
  for (const cell of cells) {
    cell.querySelector<HTMLElement>('.toei-stop-name')?.style.removeProperty('height');
    cell.style.removeProperty('--toei-stop-name-width');
    const branch = cell.querySelector<HTMLElement>('.toei-stop-branch');
    branch?.style.removeProperty('--toei-map-branch-left');
    branch?.style.removeProperty('--toei-map-branch-width');
    const transfers = cell.querySelector<HTMLElement>('.toei-stop-transfers');
    transfers?.style.removeProperty('--toei-english-transfer-shift');
    transfers?.style.removeProperty('gap');
    transfers?.style.removeProperty('grid-template-columns');
    const nameText = cell.querySelector<HTMLElement>('.toei-stop-name-text')!;
    for (const property of ['--toei-stop-text-height', '--toei-stop-text-y'])
      nameText.style.removeProperty(property);
    for (const character of cell.querySelectorAll<HTMLElement>('.toei-stop-character'))
      character.style.removeProperty('height');
    for (const glyph of cell.querySelectorAll<HTMLElement>('.toei-stop-glyph'))
      glyph.style.removeProperty('--toei-glyph-offset-y');
    cell
      .querySelector<HTMLElement>('.toei-stop-transfers')
      ?.style.removeProperty('--toei-transfer-scale');
    const count = Number(cell.dataset.transferCount);
    cell.dataset.transferColumns = !english && count > 5 ? '2' : '1';
    cell.style.setProperty(
      '--toei-transfer-rows',
      String(Math.ceil(count / Number(cell.dataset.transferColumns))),
    );
  }
}

function fitJapaneseStops(diagram: HTMLElement, cells: HTMLElement[], unit: number) {
  const columns = () => {
    const values = cells.map(
      (cell) =>
        `${Number(cell.dataset.stopWeight) + (cell.dataset.transferColumns === '2' ? 0.75 : 0)}fr`,
    );
    if (diagram.querySelector('.toei-stop-continuation'))
      values.push('var(--toei-continuation-width, 3.5fr)');
    diagram.style.setProperty('--toei-fitted-columns', values.join(' '));
  };
  columns();
  const transfersByCell = cells.flatMap((cell) => {
    const transfers = cell.querySelector<HTMLElement>('.toei-stop-transfers');
    return transfers ? [{ cell, transfers }] : [];
  });
  const transferBottom = transfersByCell[0]?.transfers.getBoundingClientRect().bottom;
  const budget = Math.max(1, (transferBottom ?? 0) - diagram.getBoundingClientRect().top);
  const twoColumns = transfersByCell.filter(
    ({ cell, transfers }) =>
      cell.dataset.transferColumns === '1' && transfers.getBoundingClientRect().height > budget,
  );
  for (const { cell } of twoColumns) {
    cell.dataset.transferColumns = '2';
    cell.style.setProperty(
      '--toei-transfer-rows',
      String(Math.ceil(Number(cell.dataset.transferCount) / 2)),
    );
  }
  if (twoColumns.length) columns();
  let remaining = transfersByCell.map(({ transfers }) => ({ transfers, scale: 1 }));
  for (let attempt = 0; attempt < 3 && remaining.length; attempt++) {
    remaining = remaining.flatMap(({ transfers, scale }) => {
      const height = transfers.getBoundingClientRect().height;
      return height > budget ? [{ transfers, scale: scale * (budget / height) * 0.96 }] : [];
    });
    for (const { transfers, scale } of remaining)
      transfers.style.setProperty('--toei-transfer-scale', String(scale));
  }
  fitJapaneseNames(cells, unit);
  fitTransferColumns(cells, unit);
  fitHorizontalText(diagram, '.toei-transfer-name-text', '--toei-transfer-text-x');
  alignJapaneseTransferText(diagram);
  fitBranches(cells, unit, false);
}

/** Reset previous measurements before fitting the active language and its route annotations. */
export function fitToeiDiagram(root: HTMLElement, english: boolean) {
  const diagram = root.querySelector<HTMLOListElement>('.toei-stop-diagram')!;
  const cells = [...diagram.querySelectorAll<HTMLElement>(':scope > li[data-stop-weight]')];
  const unit = root.closest('.toei-board')!.getBoundingClientRect().width / 100;
  resetDiagram(diagram, cells, english);
  if (english) fitEnglishStops(root, diagram, cells, unit);
  else {
    fitJapaneseStops(diagram, cells, unit);
    fitHorizontalText(root, '.toei-continuation-text', '--toei-continuation-text-x');
  }
  fitCurrentCut(cells);
}

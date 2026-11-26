import { toeiEnglishStopWeight } from './toei-diagram';

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

function fitBranches(cells: HTMLElement[], unit: number, english: boolean) {
  const fitted: { branch: HTMLElement; width: number }[] = [];
  for (const cell of cells) {
    const branch = cell.querySelector<HTMLElement>('.toei-stop-branch');
    if (!branch) continue;
    const contents = [
      ...cell.querySelectorAll(
        english ? '.toei-transfer-symbol' : '.toei-transfer-symbol, .toei-transfer-name-text',
      ),
    ];
    const start = branch.getBoundingClientRect().left;
    const right =
      Math.max(...contents.map((content) => content.getBoundingClientRect().right)) + 0.15 * unit;
    const width = Math.max(
      1,
      Math.min(cell.getBoundingClientRect().right - 0.15 * unit, right) - start,
    );
    fitted.push({ branch, width });
  }
  for (const { branch, width } of fitted)
    branch.style.setProperty('--toei-map-branch-width', `${width}px`);
}

/** Recover the rotated character's thickness instead of projecting its oversized axis-aligned box. */
function fitCurrentBackground(cells: HTMLElement[], unit: number) {
  const cell = cells.find((cell) => cell.dataset.kind === 'current');
  const background = cell?.querySelector<HTMLElement>('.toei-stop-current-background');
  const text = cell?.querySelector('.toei-stop-name-text')?.firstChild;
  if (!cell || !background || !text?.textContent) return;
  const slope = Math.tan(Math.PI / 6);
  const bottom =
    cell.getBoundingClientRect().bottom - parseFloat(getComputedStyle(background).bottom);
  let left = Infinity;
  let right = -Infinity;
  const range = document.createRange();
  for (let index = 0; index < text.textContent.length; index++) {
    range.setStart(text, index);
    range.setEnd(text, index + 1);
    const glyph = range.getBoundingClientRect();
    const center = glyph.left + glyph.width / 2 + slope * (glyph.top + glyph.height / 2);
    // For a -60° rotation: boxWidth = w/2 + h√3/2, boxHeight = w√3/2 + h/2.
    const height = Math.max(0, Math.sqrt(3) * glyph.width - glyph.height);
    const halfWidth = height / (2 * Math.cos(Math.PI / 6));
    left = Math.min(left, center - halfWidth);
    right = Math.max(right, center + halfWidth);
  }
  const padding = 0.12 * unit;
  background.style.left = `${left - slope * bottom - cell.getBoundingClientRect().left - padding}px`;
  background.style.width = `${right - left + 2 * padding}px`;
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
  for (const cell of cells) {
    const bounds = cell.getBoundingClientRect();
    const transfers = cell.querySelector<HTMLElement>('.toei-stop-transfers');
    const count = Number(cell.dataset.transferCount);
    if (transfers && count > 1) {
      const iconWidth = transfers
        .querySelector('.toei-transfer-symbol')!
        .getBoundingClientRect().width;
      const available = bounds.right - 0.3 * unit - transfers.getBoundingClientRect().left;
      const gap = Math.max(0, Math.min(0.35 * unit, (available - count * iconWidth) / (count - 1)));
      transfers.style.gap = `${gap}px`;
    }
  }
  fitEnglishLabels(root, cells, unit);
  fitHorizontalText(root, '.toei-stop-name-text', '--toei-stop-text-x');
  fitHorizontalText(root, '.toei-transfer-name-text', '--toei-transfer-text-x');
  fitBranches(cells, unit, true);
  fitCurrentBackground(cells, unit);
}

function fitEnglishLabels(root: HTMLElement, cells: HTMLElement[], unit: number) {
  const map = root.getBoundingClientRect();
  const labelCells = [
    ...cells,
    ...root.querySelectorAll<HTMLElement>('.toei-meguro-station, .toei-meguro-line'),
  ];
  for (const cell of labelCells) {
    const bounds = cell.getBoundingClientRect();
    for (const label of cell.querySelectorAll<HTMLElement>(
      '.toei-stop-name, .toei-transfer-name',
    )) {
      const rect = label.getBoundingClientRect();
      const overRight = Math.max(0, rect.right - bounds.right + 0.2 * unit);
      const overTop = Math.max(
        0,
        Math.max(map.top + 0.2 * unit, bounds.top + 0.15 * unit) - rect.top,
      );
      const width = label.clientWidth - Math.max(overRight / 0.5, overTop / Math.sin(Math.PI / 3));
      if (overRight || overTop)
        label.style.setProperty('--toei-english-label-width', `${Math.max(0.4 * unit, width)}px`);
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
    return { name, height, width };
  });
  for (const { name, height, width } of slots) {
    name.style.height = `${height}px`;
    name.style.setProperty('--toei-stop-name-width', `${width}px`);
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
  for (const label of diagram.querySelectorAll<HTMLElement>('.toei-stop-name, .toei-transfer-name'))
    label.style.removeProperty('--toei-english-label-width');
  for (const cell of cells) {
    cell.querySelector<HTMLElement>('.toei-stop-name')?.style.removeProperty('height');
    cell
      .querySelector<HTMLElement>('.toei-stop-name')
      ?.style.removeProperty('--toei-stop-name-width');
    cell
      .querySelector<HTMLElement>('.toei-stop-branch')
      ?.style.removeProperty('--toei-map-branch-width');
    const transfers = cell.querySelector<HTMLElement>('.toei-stop-transfers');
    transfers?.style.removeProperty('gap');
    transfers?.style.removeProperty('grid-template-columns');
    const nameText = cell.querySelector<HTMLElement>('.toei-stop-name-text')!;
    for (const property of ['--toei-stop-text-height', '--toei-stop-text-x', '--toei-stop-text-y'])
      nameText.style.removeProperty(property);
    for (const character of cell.querySelectorAll<HTMLElement>('.toei-stop-character'))
      character.style.removeProperty('height');
    for (const glyph of cell.querySelectorAll<HTMLElement>('.toei-stop-glyph'))
      glyph.style.removeProperty('--toei-glyph-offset-y');
    for (const text of cell.querySelectorAll<HTMLElement>('.toei-transfer-name-text'))
      text.style.removeProperty('--toei-transfer-text-x');
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

function fitJapaneseStops(
  root: HTMLElement,
  diagram: HTMLElement,
  cells: HTMLElement[],
  unit: number,
) {
  const budget = Math.max(1, root.clientHeight - unit * 3.9);
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
  fitHorizontalText(root, '.toei-transfer-name-text', '--toei-transfer-text-x');
  fitBranches(cells, unit, false);
}

/** Reset previous measurements before fitting the active language and its route annotations. */
export function fitToeiDiagram(root: HTMLElement, english: boolean) {
  const diagram = root.querySelector<HTMLOListElement>('.toei-stop-diagram')!;
  const cells = [...diagram.querySelectorAll<HTMLElement>(':scope > li[data-stop-weight]')];
  const unit = root.closest('.toei-board')!.getBoundingClientRect().width / 100;
  resetDiagram(diagram, cells, english);
  if (english) fitEnglishStops(root, diagram, cells, unit);
  else fitJapaneseStops(root, diagram, cells, unit);
  fitHorizontalText(root, '.toei-continuation-text', '--toei-continuation-text-x');
  fitCurrentCut(cells);
}

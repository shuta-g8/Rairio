import { readStoredValue, writeStoredValue } from './storage.ts';

export type BoardMode = 'default' | 'toei';
export const TOEI_VIEWING_NOTE =
  '都営LCD風表示は、PC・タブレットなど画面の広い端末での閲覧をおすすめします。';
const BOARD_MODE_KEY = 'rairio:board-mode:v1';

export function loadBoardMode(): BoardMode {
  return readStoredValue(BOARD_MODE_KEY) === 'toei' ? 'toei' : 'default';
}

export function saveBoardMode(mode: BoardMode): void {
  writeStoredValue(BOARD_MODE_KEY, mode);
}

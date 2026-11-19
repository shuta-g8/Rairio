import type { BoardMode } from '../lib/board-mode';

export function BoardModeSwitch({
  mode,
  onChange,
}: {
  mode: BoardMode;
  onChange: (mode: BoardMode) => void;
}) {
  return (
    <div className="board-mode-control">
      <span id="board-mode-label" className="board-mode-label">
        表示形式
      </span>
      <div
        className="board-mode-switch"
        data-mode={mode}
        role="group"
        aria-labelledby="board-mode-label"
      >
        <button type="button" aria-pressed={mode === 'default'} onClick={() => onChange('default')}>
          サイトデフォルト
        </button>
        <button type="button" aria-pressed={mode === 'toei'} onClick={() => onChange('toei')}>
          都営LCD風
        </button>
      </div>
    </div>
  );
}

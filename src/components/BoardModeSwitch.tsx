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
      <div className="board-mode-switch" data-mode={mode} role="group" aria-label="表示形式">
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

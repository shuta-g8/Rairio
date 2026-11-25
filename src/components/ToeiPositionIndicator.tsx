import type { ToeiObservedPosition } from '../lib/toei-position';
import { TrainIcon } from '@phosphor-icons/react/dist/csr/Train';
import type { ToeiDiagramDirection } from '../lib/toei-diagram';
import type { ToeiDisplayLanguage } from '../lib/toei-language';

const POSITION_LABELS = {
  ja: ['ぜんぜんえき', 'ぜんえき', 'とうえき'],
  en: ['Two stops away', 'Previous stop', 'This station'],
  'zh-Hans': ['前两站', '上一站', '本站'],
  ko: ['두 정거장 전', '이전 역', '이 역'],
} satisfies Record<ToeiDisplayLanguage, readonly [string, string, string]>;

function TrainInFrame() {
  return (
    <span className="toei-position-train-frame" aria-hidden="true">
      <TrainIcon className="toei-position-train" weight="fill" />
    </span>
  );
}

export function ToeiPositionIndicator({
  position,
  direction,
  language,
}: {
  position: ToeiObservedPosition;
  direction: ToeiDiagramDirection;
  language: ToeiDisplayLanguage;
}) {
  const [beforePrevious, previous, current] = POSITION_LABELS[language];
  return (
    <div
      className="toei-position-indicator"
      role="note"
      aria-label={`先発列車の位置：${position.description}${position.estimated ? '（独自推定）' : ''}`}
      data-stage={position.stage}
      data-direction={direction}
    >
      {position.estimated && <small className="toei-position-estimate">独自推定</small>}
      <div
        className="toei-position-box"
        data-active={(!position.segment && position.stage === 'before-previous') || undefined}
      >
        <strong>前々駅</strong>
        <small lang={language}>{beforePrevious}</small>
        {!position.segment && position.stage === 'before-previous' && <TrainInFrame />}
      </div>
      <span
        className="toei-position-segment"
        data-active={position.segment === 'first' || position.segment === 'both' || undefined}
      >
        <svg className="toei-position-arrow" viewBox="0 0 100 100" aria-hidden="true">
          <path d="M10 30H52V12L92 50 52 88V70H10Z" />
        </svg>
        {(position.segment === 'first' || position.segment === 'both') && <TrainInFrame />}
      </span>
      <div
        className="toei-position-box"
        data-active={(!position.segment && position.stage === 'previous') || undefined}
      >
        <strong>前　駅</strong>
        <small lang={language}>{previous}</small>
        {!position.segment && position.stage === 'previous' && <TrainInFrame />}
      </div>
      <span
        className="toei-position-segment"
        data-active={position.segment === 'second' || position.segment === 'both' || undefined}
      >
        <svg className="toei-position-arrow" viewBox="0 0 100 100" aria-hidden="true">
          <path d="M10 30H52V12L92 50 52 88V70H10Z" />
        </svg>
        {position.segment === 'second' && <TrainInFrame />}
      </span>
      <div className="toei-position-box toei-position-current">
        <strong>当　駅</strong>
        <small lang={language}>{current}</small>
        {!position.segment && position.stage === 'here' && <TrainInFrame />}
      </div>
    </div>
  );
}

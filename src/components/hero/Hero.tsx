import { ClockIcon } from '@phosphor-icons/react/dist/csr/Clock';
import { memo, useCallback, useState } from 'react';
import type { OperationsSnapshot } from '../../../shared/railways';
import { APP_NAME } from '../../lib/brand';
import { clockFormatter, dateFormatter } from '../../lib/format';
import { DAY_LABEL, dayKind, serviceDate } from '../../lib/time';
import { operationsArePrevious, type OperationsData } from '../../lib/operations';
import { useClock } from '../../hooks/useClock';
import LogoAnimation from '../LogoAnimation';
import { HERO_LOGO_DELAY, HERO_LOGO_DURATION } from './timing';
import { HeroOperations } from './HeroOperations';
import { HeroOperationText } from './HeroOperationText';
export function Hero({ operations }: { operations: OperationsData }) {
  const now = useClock();
  const previous = operationsArePrevious(operations, now);
  return (
    <section className="hero" aria-label="現在時刻と運行状況">
      <div className="hero-inner">
        <div className="hero-main">
          <HeroStage
            snapshot={operations.snapshot}
            loading={operations.loading}
            previous={previous}
          />
          <HeroRails />
          <HeroClock now={now} />
        </div>
        <div className="hero-bottom">
          <HeroOperationText
            snapshot={operations.snapshot}
            loading={operations.loading}
            previous={previous}
          />
        </div>
      </div>
    </section>
  );
}

const HeroRails = memo(function HeroRails() {
  return (
    <svg className="hero-rails" viewBox="0 0 600 300" fill="none" aria-hidden="true">
      <path
        d="M-20 295 190 85Q220 55 250 85L460 295M70 310 250 130Q280 100 310 130L500 320M-40 200 140 20Q170-10 200 20L510 330"
        stroke="currentColor"
        strokeWidth="1"
      />
      <path d="M-20 260H620M-20 180H620M-20 100H620" stroke="currentColor" strokeWidth=".5" />
      <circle cx="190" cy="85" r="6" fill="currentColor" />
      <circle cx="370" cy="205" r="5" fill="currentColor" />
      <circle cx="380" cy="200" r="4" fill="currentColor" />
    </svg>
  );
});

function HeroClock({ now }: { now: Date }) {
  const [hours, minutes, seconds] = clockFormatter.format(now).split(':');
  return (
    <div className="hero-clock">
      <p>
        <ClockIcon size={14} aria-hidden="true" />
        <span className="clock-timezone">JST</span>
        <span className="clock-service-day">{DAY_LABEL[dayKind(serviceDate(now))]}ダイヤ</span>
      </p>
      <div className="clock-digits" aria-label={`日本時間 ${hours}時${minutes}分${seconds}秒`}>
        <span>
          {hours}
          <span className="clock-colon">:</span>
          {minutes}
        </span>
        <small>{seconds}</small>
      </div>
      <div className="clock-date">{dateFormatter.format(now)}</div>
    </div>
  );
}

const HeroStage = memo(function HeroStage({
  snapshot,
  loading,
  previous,
}: {
  snapshot: OperationsSnapshot | null;
  loading: boolean;
  previous: boolean;
}) {
  const [complete, setComplete] = useState(false);
  const finishLogo = useCallback(() => setComplete(true), []);
  return (
    <div className="hero-stage" data-logo-complete={complete ? '' : undefined}>
      <div className="hero-copy">
        <h1 className="hero-headline" aria-label={APP_NAME}>
          <LogoAnimation
            className="hero-logo"
            width="min(var(--hero-logo-width), 90%)"
            duration={HERO_LOGO_DURATION}
            delay={HERO_LOGO_DELAY}
            color="currentColor"
            decorative
            onComplete={finishLogo}
          />
        </h1>
      </div>
      <HeroOperations snapshot={snapshot} loading={loading} previous={previous} />
    </div>
  );
});

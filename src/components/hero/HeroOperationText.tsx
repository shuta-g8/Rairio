import { memo, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { OperationsSnapshot } from '../../../shared/railways';
import { summarizeOperations } from '../../lib/operations';
export const HeroOperationText = memo(function HeroOperationText({
  snapshot,
  loading,
  previous,
}: {
  snapshot: OperationsSnapshot | null;
  loading: boolean;
  previous: boolean;
}) {
  const summary = summarizeOperations(snapshot);
  let message = summary.text;
  if (!snapshot && loading) message = '都営地下鉄の運行情報を確認しています。';
  else if (snapshot && previous) {
    message = `前回取得情報：${summary.text} ${loading ? '最新情報を確認中です。' : '最新情報は未確認です。'}`;
  }
  const viewport = useRef<HTMLParagraphElement>(null);
  const content = useRef<HTMLSpanElement>(null);
  const [scrollDistance, setScrollDistance] = useState(0);

  useLayoutEffect(() => {
    const container = viewport.current!;
    const text = content.current!;
    const measure = () => {
      const width = text.getBoundingClientRect().width;
      setScrollDistance(width > container.clientWidth ? width + 48 : 0);
      container.scrollLeft = 0;
    };
    measure();
    // Recheck on viewport changes and when the web font changes the text width.
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(text);
    return () => observer.disconnect();
  }, [message]);

  return (
    <p
      ref={viewport}
      className="hero-operation-text"
      data-state={summary.state}
      data-scrolling={scrollDistance > 0 ? '' : undefined}
      role="status"
      aria-atomic="true"
      tabIndex={scrollDistance > 0 ? 0 : undefined}
      title={message}
      style={{ '--operation-scroll-duration': `${scrollDistance / 40}s` } as CSSProperties}
    >
      <span className="hero-operation-track" key={message}>
        <span className="hero-operation-message" ref={content}>
          {message}
        </span>
        {scrollDistance > 0 && (
          <span className="hero-operation-copy" aria-hidden="true">
            {message}
          </span>
        )}
      </span>
    </p>
  );
});

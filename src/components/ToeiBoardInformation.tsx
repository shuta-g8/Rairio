import { memo, useLayoutEffect, useRef } from 'react';
import type { ToeiGuidanceSegment, ToeiInformationMessage } from '../lib/toei-guidance';
import { observeToeiTextLayout } from '../lib/toei-text-measure';
import { useToeiInformationScroll } from '../hooks/useToeiInformationScroll';

function InformationSegments({ segments }: { segments: ToeiGuidanceSegment[] }) {
  return segments.map(({ text, tone, href }, index) =>
    href ? (
      <a
        className={`toei-guidance-${tone}`}
        href={href}
        target="_blank"
        rel="noreferrer"
        key={index}
      >
        {text}
      </a>
    ) : (
      <span className={`toei-guidance-${tone}`} key={index}>
        {text}
      </span>
    ),
  );
}

export const ToeiBoardInformation = memo(function ToeiBoardInformation({
  messages,
  continuous,
  onCycleComplete,
  onFocusChange,
}: {
  messages: readonly ToeiInformationMessage[];
  continuous: boolean;
  onCycleComplete?: () => void;
  onFocusChange?: (focused: boolean) => void;
}) {
  const contentKey = JSON.stringify(messages);
  const { viewport, sequence } = useToeiInformationScroll(contentKey, continuous);
  useLayoutEffect(() => {
    // A selected link can disappear when new information replaces its message.
    if (!viewport.current?.contains(document.activeElement)) onFocusChange?.(false);
  }, [contentKey, onFocusChange, viewport]);
  return (
    <div
      ref={viewport}
      className="toei-board-information"
      role="note"
      aria-label="運行情報・ご案内"
      tabIndex={0}
      onFocus={() => onFocusChange?.(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onFocusChange?.(false);
      }}
    >
      <div
        className="toei-information-track"
        key={contentKey}
        onAnimationIteration={onCycleComplete}
      >
        <div ref={sequence} className="toei-information-sequence">
          {messages.map((message) => (
            <span
              className="toei-information-message"
              data-message-id={message.id}
              key={message.id}
            >
              <InformationSegments segments={message.segments} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
});

export function ToeiFixedInformation({
  message,
  language,
}: {
  message: ToeiInformationMessage;
  language: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const content = message.segments.map(({ text }) => text).join('');
  useLayoutEffect(() => {
    const root = viewport.current!;
    const label = text.current!;
    function measure() {
      const { paddingLeft, paddingRight } = getComputedStyle(root);
      const available = root.clientWidth - parseFloat(paddingLeft) - parseFloat(paddingRight);
      label.style.setProperty(
        '--toei-fixed-text-scale',
        String(Math.min(1, available / Math.max(1, label.offsetWidth))),
      );
    }
    measure();
    return observeToeiTextLayout(root, measure, [label]);
  }, [content, language]);
  return (
    <div
      ref={viewport}
      className="toei-board-information toei-fixed-information"
      role="note"
      lang={language}
    >
      <span ref={text} className="toei-information-message" data-message-id={message.id}>
        <InformationSegments segments={message.segments} />
      </span>
    </div>
  );
}

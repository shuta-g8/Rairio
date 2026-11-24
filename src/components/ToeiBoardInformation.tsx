import { memo } from 'react';
import type { ToeiInformationMessage } from '../lib/toei-guidance';
import { useToeiInformationScroll } from '../hooks/useToeiInformationScroll';

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
  return (
    <div
      ref={viewport}
      className="toei-board-information"
      role="note"
      aria-label="運行情報・ご案内"
      tabIndex={0}
      onFocus={() => onFocusChange?.(true)}
      onBlur={() => onFocusChange?.(false)}
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
              {message.segments.map(({ text, tone }, index) => (
                <span className={`toei-guidance-${tone}`} key={index}>
                  {text}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
});

export function ToeiPossibleDelayNotice() {
  return (
    <div className="toei-board-information toei-board-delay-notice">
      <p role="status">
        この方面では列車が遅れている可能性があるため、最新の状況は
        <a
          href="https://www.kotsu.metro.tokyo.jp/pickup_information/app.html"
          target="_blank"
          rel="noreferrer"
        >
          都営交通アプリ
        </a>
        でご確認ください。
      </p>
    </div>
  );
}

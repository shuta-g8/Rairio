import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export function AnimatedDetails({
  expanded,
  onToggle,
  className,
  style,
  summary,
  summaryClassName,
  keepMounted = false,
  children,
}: {
  expanded: boolean;
  onToggle: () => void;
  className: string;
  style?: CSSProperties;
  summary: ReactNode;
  summaryClassName?: string;
  keepMounted?: boolean;
  children: ReactNode;
}) {
  const element = useRef<HTMLDetailsElement>(null);
  const height = useRef<number | null>(null);
  const closingAnimation = useRef<Animation | null>(null);
  const previousExpanded = useRef(expanded);
  const [retained, setRetained] = useState(expanded);

  useLayoutEffect(() => {
    if (previousExpanded.current === expanded) return;
    previousExpanded.current = expanded;
    const details = element.current!;
    if (!expanded && !details.open) return;
    const summaryHeight =
      details.querySelector('summary')!.getBoundingClientRect().height +
      details.offsetHeight -
      details.clientHeight;
    const from =
      height.current ?? (expanded ? summaryHeight : details.getBoundingClientRect().height);
    const to = expanded ? details.getBoundingClientRect().height : summaryHeight;
    height.current = null;
    if (expanded) setRetained(true);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (!expanded) setRetained(false);
      return;
    }
    const animation = details.animate(
      [
        { height: `${from}px`, overflow: 'clip' },
        { height: `${to}px`, overflow: 'clip' },
      ],
      { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
    );
    animation.onfinish = () => {
      height.current = null;
      if (expanded) animation.cancel();
      else {
        closingAnimation.current = animation;
        setRetained(false);
      }
    };
    return () => {
      // Start rapid reversals from the current visual height without jumping.
      if (animation.playState === 'running')
        height.current = details.getBoundingClientRect().height;
      animation.onfinish = null;
      animation.cancel();
    };
  }, [expanded]);

  useLayoutEffect(() => {
    if (expanded || retained) return;
    closingAnimation.current?.cancel();
    closingAnimation.current = null;
  }, [expanded, retained]);

  return (
    <details
      ref={element}
      className={className}
      open={expanded || retained}
      data-expanded={expanded}
      style={style}
    >
      <summary
        className={summaryClassName}
        aria-expanded={expanded}
        onClick={(event) => {
          event.preventDefault();
          onToggle();
        }}
      >
        {summary}
      </summary>
      {(keepMounted || expanded || retained) && <div inert={!expanded}>{children}</div>}
    </details>
  );
}

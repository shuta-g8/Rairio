import { useLayoutEffect, useRef } from 'react';
import { observeToeiTextLayout } from '../lib/toei-text-measure';
import { fitToeiDiagram } from '../lib/toei-diagram-layout';
import type { ToeiStop } from '../lib/toei-stops';
import type { ToeiDiagramDirection } from '../lib/toei-diagram';
import type { ToeiContinuation } from '../lib/toei-map-labels';

/** Remeasure only when content, language, container size or loaded fonts change. */
export function useToeiDiagramFit(
  english: boolean,
  stops: readonly ToeiStop[],
  continuation?: ToeiContinuation,
  direction: ToeiDiagramDirection = 'right',
) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = ref.current!;
    return observeToeiTextLayout(root, () => fitToeiDiagram(root, english));
  }, [english, stops, continuation, direction]);
  return ref;
}

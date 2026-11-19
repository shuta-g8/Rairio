import { memo, type ComponentPropsWithoutRef } from 'react';
import { stationUrl } from '../lib/station-url';

type Props = Omit<ComponentPropsWithoutRef<'a'>, 'href' | 'onClick'> & {
  stationId: string;
  onSelectStation?: (id: string) => void;
  scrollToDepartures?: boolean;
};

export const StationLink = memo(function StationLink({
  stationId,
  onSelectStation,
  scrollToDepartures = true,
  ...props
}: Props) {
  return (
    <a
      {...props}
      href={stationUrl(stationId, window.location.href)}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          (event.currentTarget.target && event.currentTarget.target !== '_self')
        )
          return;
        event.preventDefault();
        onSelectStation?.(stationId);
        // Let the new station heading render before moving keyboard focus.
        requestAnimationFrame(() => {
          const section = document.getElementById('departures');
          section?.focus({ preventScroll: true });
          if (scrollToDepartures) section?.scrollIntoView({ block: 'start' });
        });
      }}
    />
  );
});

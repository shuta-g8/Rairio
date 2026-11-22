import { memo, useState, type CSSProperties } from 'react';
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown';
import { STATION_RAILWAYS, stationDisplayName } from '../lib/stations';
import { AnimatedDetails } from './AnimatedDetails';
import { StationLink } from './StationLink';

interface Props {
  stationId: string;
  changeStation: (id: string, railwayId?: string) => void;
}

export const StationDirectory = memo(function StationDirectory({
  stationId,
  changeStation,
}: Props) {
  const [expandedLine, setExpandedLine] = useState<string | null>(null);
  return (
    <nav className="station-directory" aria-label="駅から発車案内を探す">
      <div className="directory-lines">
        {STATION_RAILWAYS.map((line) => {
          return (
            <AnimatedDetails
              key={line.id}
              className="directory-line"
              expanded={expandedLine === line.id}
              style={{ '--line-color': line.color } as CSSProperties}
              onToggle={() => {
                setExpandedLine((current) => (current === line.id ? null : line.id));
              }}
              summary={
                <>
                  <span className="directory-line-code" aria-hidden="true">
                    {line.code}
                  </span>
                  <span className="directory-line-name">
                    {line.name.replace(/^都営/, '')}
                    <small>
                      {stationDisplayName(line.stations[0])}〜
                      {stationDisplayName(line.stations.at(-1)!)}
                    </small>
                  </span>
                  <span className="directory-line-count">{line.stations.length}駅</span>
                  <CaretDownIcon size={16} aria-hidden="true" />
                </>
              }
            >
              <div className="directory-stations">
                {line.stations.map((station) => (
                  <StationLink
                    key={station.id}
                    stationId={station.id}
                    scrollToDepartures={false}
                    aria-current={stationId === station.id ? 'true' : undefined}
                    onSelectStation={(id) => changeStation(id, line.id)}
                  >
                    <span className="directory-station-code" aria-hidden="true">
                      {station.memberships?.find((member) => member.railwayId === line.id)?.code}
                    </span>
                    {stationDisplayName(station)}
                  </StationLink>
                ))}
              </div>
            </AnimatedDetails>
          );
        })}
      </div>
    </nav>
  );
});

import { memo } from 'react';
import { destinationPresentation, englishPlatform } from '../lib/destinations';

interface Props {
  destination: string;
  platform?: string;
  extra?: boolean;
  yamanoteDirection?: string;
}

// No language state/timer: CSS switches only these two layers. Both remain in
// the grid so their shared height, sibling DOM and sibling animations stay stable.
export const Destination = memo(function Destination({
  destination,
  platform,
  extra,
  yamanoteDirection,
}: Props) {
  const { name, suffix, english, englishPrefix } = destinationPresentation(
    destination,
    yamanoteDirection,
  );
  return (
    <div
      className={`departure-destination${yamanoteDirection !== undefined ? ' yamanote-destination' : ''}${english ? ' bilingual-destination' : ''}`}
    >
      <div className="destination-language" lang="ja">
        <span className="destination-name">
          {name}
          <small>{suffix}</small>
        </span>
        {(platform || extra) && (
          <div className="platform">
            {platform && <span>{platform}番線</span>}
            {extra && <span className="conditional">運転日注意</span>}
          </div>
        )}
      </div>
      {english && (
        <div className="destination-language" lang="en">
          <span className="destination-name">
            {englishPrefix && (
              <>
                <small>{englishPrefix}</small>
                <wbr />
              </>
            )}
            {english}
          </span>
          {(platform || extra) && (
            <div className="platform">
              {platform && <span>{englishPlatform(platform)}</span>}
              {extra && <span className="conditional">Check operating days</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

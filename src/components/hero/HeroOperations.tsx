import { BroadcastIcon } from '@phosphor-icons/react/dist/csr/Broadcast';
import { memo, useMemo, type CSSProperties } from 'react';
import { RAILWAYS, type OperationsSnapshot } from '../../../shared/railways';
import { COMPANY_STATUS, indexOperations } from '../../lib/operations';
import { updatedAtFormatter } from '../../lib/format';
import { StatusBadge } from '../operations/OperationBadge';
import { RAILWAY_CATALOG } from '../../generated/station-directory';
import { RailMark } from '../RailMark';
import { LoadingSpinner } from '../LoadingStatus';
export const HeroOperations = memo(function HeroOperations({
  snapshot,
  previous,
  loading,
}: {
  snapshot: OperationsSnapshot | null;
  previous: boolean;
  loading: boolean;
}) {
  const groups = useMemo(() => {
    const byId = indexOperations(snapshot);
    return RAILWAYS.map(
      (railway) =>
        ({
          operator: railway.name,
          appearance: RAILWAY_CATALOG.find((line) => line.id === railway.id)!,
          state: byId.get(railway.id)?.state || 'unknown',
        }) as const,
    );
  }, [snapshot]);
  return (
    <div className="hero-operations" aria-label="都営地下鉄の運行サマリー">
      <div className="hero-operations-heading">
        <h2>
          <BroadcastIcon size={14} aria-hidden="true" />
          都営地下鉄の運行状況
        </h2>
        <span className="hero-updated" title="運行情報の取得日時（日本時間）">
          {snapshot ? (
            <>
              <span>{previous ? '前回取得' : '最終更新'}</span>
              <time dateTime={snapshot.fetchedAt}>
                {updatedAtFormatter.format(new Date(snapshot.fetchedAt))}
              </time>
            </>
          ) : loading ? (
            <>
              <LoadingSpinner />
              確認中
            </>
          ) : (
            '情報未取得'
          )}
        </span>
      </div>
      <div className="hero-company-grid">
        {groups.map(({ operator: company, appearance, state }, index) => {
          return (
            <div
              key={company}
              className="hero-company"
              style={{ '--company-index': index } as CSSProperties}
            >
              <span className="hero-rail-icon" aria-hidden="true">
                <RailMark color={appearance.color} symbol={appearance.code} />
              </span>
              <span className="hero-line-name">{company}</span>
              <StatusBadge state={state}>{COMPANY_STATUS[state]}</StatusBadge>
            </div>
          );
        })}
      </div>
    </div>
  );
});

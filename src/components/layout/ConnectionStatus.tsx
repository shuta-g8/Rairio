import { WifiSlashIcon } from '@phosphor-icons/react/dist/csr/WifiSlash';
import { memo } from 'react';
export const ConnectionStatus = memo(function ConnectionStatus({ online }: { online: boolean }) {
  if (online) return null;

  return (
    <div className="connection-status" role="status">
      <WifiSlashIcon size={14} aria-hidden="true" />
      <span>オフラインで利用中</span>
    </div>
  );
});

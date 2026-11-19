import { updatedAtFormatter } from '../lib/format';
import { memo } from 'react';

export const UpdatedAt = memo(function UpdatedAt({
  timestamp,
  label,
  caption = '最終更新',
}: {
  timestamp?: string;
  label: string;
  caption?: string;
}) {
  return (
    <span className="updated-at" title={label}>
      <span>{caption}</span>
      {timestamp ? (
        <time dateTime={timestamp}>{updatedAtFormatter.format(new Date(timestamp))}</time>
      ) : (
        <span>未取得</span>
      )}
    </span>
  );
});

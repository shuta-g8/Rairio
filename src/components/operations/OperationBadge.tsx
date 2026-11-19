import { CircleIcon } from '@phosphor-icons/react/dist/csr/Circle';
import { WarningIcon } from '@phosphor-icons/react/dist/csr/Warning';
import type { ReactNode } from 'react';
import type { LineOperation, OperationState } from '../../../shared/railways';

export function StatusBadge({ state, children }: { state: OperationState; children: ReactNode }) {
  const Icon = state === 'normal' ? CircleIcon : WarningIcon;
  return (
    <span className={`operation-badge operation-${state}`}>
      <Icon className="operation-mark" size={12} aria-hidden="true" />
      {children}
    </span>
  );
}

export function OperationBadge({
  operation,
  previous = false,
}: {
  operation?: LineOperation;
  previous?: boolean;
}) {
  if (!operation || operation.state === 'normal' || operation.state === 'unknown') return null;
  return (
    <StatusBadge state={operation.state}>
      {`${previous ? '前回：' : ''}${operation.status}`}
    </StatusBadge>
  );
}

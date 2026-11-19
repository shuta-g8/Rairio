import { ODPT_API, TOEI_OPERATOR, OPERATIONS_CATALOG } from './transit-source.ts';
export const OPERATIONS_INTERVAL = 5 * 60 * 1000;
export const OPERATIONS_SOURCE = `${ODPT_API}odpt:TrainInformation?odpt:operator=${TOEI_OPERATOR}`;
export function operationSourceUrl(_id: string): string {
  return OPERATIONS_CATALOG;
}
export const RAILWAYS = [
  {
    id: 'Asakusa',
    name: '都営浅草線',
    operator: '東京都交通局',
    aliases: ['都営浅草線', '都営地下鉄浅草線'],
  },
  {
    id: 'Mita',
    name: '都営三田線',
    operator: '東京都交通局',
    aliases: ['都営三田線', '都営地下鉄三田線'],
  },
  {
    id: 'Shinjuku',
    name: '都営新宿線',
    operator: '東京都交通局',
    aliases: ['都営新宿線', '都営地下鉄新宿線'],
  },
  {
    id: 'Oedo',
    name: '都営大江戸線',
    operator: '東京都交通局',
    aliases: ['都営大江戸線', '都営地下鉄大江戸線'],
  },
];

export type OperationState = 'normal' | 'delayed' | 'suspended' | 'other' | 'unknown';
export const OPERATION_STATES: readonly OperationState[] = [
  'normal',
  'delayed',
  'suspended',
  'other',
  'unknown',
];
const STATE_PRIORITY: readonly OperationState[] = [
  'suspended',
  'delayed',
  'other',
  'unknown',
  'normal',
];

export function worstState(states: readonly OperationState[]): OperationState {
  return STATE_PRIORITY.find((state) => states.includes(state)) || 'unknown';
}

export const RAILWAY_GROUPS = [...new Set(RAILWAYS.map((railway) => railway.operator))].map(
  (operator) => ({
    operator,
    railways: RAILWAYS.filter((railway) => railway.operator === operator),
  }),
);

export interface LineOperation {
  id: string;
  name: string;
  operator: string;
  state: OperationState;
  status: string;
  message: string;
  sourceUrl: string;
  updatedAt?: string;
  announcedAt?: string;
}
export interface OperationsSnapshot {
  version: 1;
  fetchedAt: string;
  sourceUrl: string;
  sourceUpdated: string;
  cached: boolean;
  lines: LineOperation[];
}

export function railwayForLine(line: string) {
  const normalized = line.normalize('NFKC');
  return RAILWAYS.find((railway) => railway.aliases.includes(normalized));
}

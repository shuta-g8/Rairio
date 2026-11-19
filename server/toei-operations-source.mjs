import { RAILWAYS, OPERATIONS_SOURCE, operationSourceUrl, worstState } from '../shared/railways.ts';
import { TOEI_OPERATOR } from '../shared/transit-source.ts';

function operationState(message) {
  // The source explicitly reports a threshold; do not interpret "no delays" as a delay.
  if (
    /^現在[、,\s]*(?:１５|15)分以上の遅延はありません[。.]?$/.test(message) ||
    /^(平常運転|通常運転)[。.]?$/.test(message.trim())
  )
    return 'normal';
  if (/見合|見合わせ|運休|運転停止/.test(message)) return 'suspended';
  if (/遅延|遅れ/.test(message)) return 'delayed';
  return 'other';
}

export function parseOperations(data, fetchedAt = new Date().toISOString()) {
  if (!Array.isArray(data) || !data.length)
    throw new Error('都営の運行情報を取得できませんでした。');
  const now = Date.parse(fetchedAt);
  const lines = RAILWAYS.map((railway) => {
    const base = {
      id: railway.id,
      name: railway.name,
      operator: railway.operator,
      sourceUrl: operationSourceUrl(railway.id),
    };
    const entries = data.filter(
      (x) =>
        x['odpt:operator'] === TOEI_OPERATOR &&
        x['odpt:railway'] === `odpt.Railway:Toei.${railway.id}`,
    );
    if (
      !entries.length ||
      entries.some(
        (x) =>
          typeof x['odpt:trainInformationText']?.ja !== 'string' ||
          !x['odpt:trainInformationText'].ja.trim() ||
          !Number.isFinite(Date.parse(x['dc:date'])) ||
          !Number.isFinite(Date.parse(x['dct:valid'])) ||
          Date.parse(x['dct:valid']) <= now ||
          Date.parse(x['dc:date']) > now + 60000,
      )
    )
      return {
        ...base,
        state: 'unknown',
        status: '確認できません',
        message: 'この路線の最新の運行情報を確認できませんでした。',
      };
    const messages = entries.map((x) => x['odpt:trainInformationText'].ja);
    const state = worstState(messages.map(operationState));
    const updatedAt = Math.max(
      ...entries
        .map((x) => Date.parse(x['odpt:timeOfOrigin'] || x['dc:date']))
        .filter(Number.isFinite),
    );
    const announcedAt = Math.max(
      ...entries.map((x) => Date.parse(x['odpt:timeOfOrigin'])).filter(Number.isFinite),
    );
    const status = {
      normal: '15分以上の遅延なし',
      delayed: '遅延情報あり',
      suspended: '運休・見合わせ',
      other: '運行情報あり',
    }[state];
    return {
      ...base,
      state,
      status,
      message: messages.join('\n'),
      ...(Number.isFinite(updatedAt) ? { updatedAt: new Date(updatedAt).toISOString() } : {}),
      ...(Number.isFinite(announcedAt) ? { announcedAt: new Date(announcedAt).toISOString() } : {}),
    };
  });
  if (lines.every((line) => line.state === 'unknown'))
    throw new Error('対象路線の最新の運行情報がありません。');
  return {
    version: 1,
    fetchedAt,
    sourceUrl: OPERATIONS_SOURCE,
    sourceUpdated: fetchedAt,
    cached: false,
    lines,
  };
}

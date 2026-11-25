import type { Route } from '../types.ts';

// Codes from the connecting operators' station guides. The route ID limits each
// match to lines and directions that actually run through to the destination.
const stationCodes = new Map<string, Record<string, string>>([
  [
    'Toei.Asakusa.Northbound',
    {
      青砥: 'KS-09',
      京成高砂: 'KS-10',
      京成佐倉: 'KS-35',
      宗吾参道: 'KS-38',
      京成成田: 'KS-40',
      '成田空港(鉄道)': 'KS-42',
      印西牧の原: 'HS-13',
      印旛日本医大: 'HS-14',
      芝山千代田: 'SR-01',
    },
  ],
  [
    'Toei.Asakusa.Southbound',
    {
      品川: 'KK-01',
      '羽田空港第１・第２ターミナル(京急)': 'KK-17',
      京急川崎: 'KK-20',
      神奈川新町: 'KK-34',
      金沢文庫: 'KK-49',
      '逗子・葉山': 'KK-53',
      浦賀: 'KK-61',
      京急久里浜: 'KK-67',
      三浦海岸: 'KK-71',
      三崎口: 'KK-72',
    },
  ],
  [
    'Toei.Mita.Southbound',
    {
      武蔵小杉: 'MG-11',
      日吉: 'MG-13',
      新横浜: 'SH-01',
      西谷: 'SO-08',
      大和: 'SO-14',
      海老名: 'SO-18',
      湘南台: 'SO-37',
    },
  ],
  [
    'Toei.Shinjuku.Westbound',
    {
      笹塚: 'KO-04',
      若葉台: 'KO-39',
      京王多摩センター: 'KO-41',
      橋本: 'KO-45',
    },
  ],
]);

export function toeiThroughDestinationCode(
  { id, railwayId }: Pick<Route, 'id' | 'railwayId'>,
  destination: string,
) {
  const codes = stationCodes.get(id.startsWith('Toei.') ? id : `Toei.${railwayId}.${id}`);
  return codes && Object.hasOwn(codes, destination) ? codes[destination] : undefined;
}

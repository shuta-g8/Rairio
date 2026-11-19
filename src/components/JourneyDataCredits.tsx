import { DATA_LICENSE, DATA_PROVIDER } from '../../shared/transit-source';
import { TRAIN_POSITIONS_CATALOG } from '../../shared/train-positions';
import {
  JOURNEY_GTFS_CATALOG,
  KANTO_API_DOCS,
  KANTO_DATA_TERMS,
  TOEI_FARE_SOURCE,
  YAMANOTE_ORDER_SOURCE,
} from '../../shared/journey-sources';

export function JourneyDataCredits() {
  return (
    <>
      <p>
        経路の時刻・運賃の出典：{DATA_PROVIDER}。
        <a href={JOURNEY_GTFS_CATALOG} target="_blank" rel="noreferrer">
          鉄道関連情報（GTFS）
        </a>
        をRairioが都営4路線に抽出・加工し、駅IDの統合、経路計算、IC・きっぷ運賃の表示に使用しています。
        <a href={DATA_LICENSE} target="_blank" rel="noreferrer">
          CC BY 4.0
        </a>
        。
        <a href={TOEI_FARE_SOURCE} target="_blank" rel="noreferrer">
          普通運賃表
        </a>
        も参照しています。
      </p>
      <p>
        LCDの接近・発車済み案内には、同提供者の
        <a href={TRAIN_POSITIONS_CATALOG} target="_blank" rel="noreferrer">
          列車ロケーション情報
        </a>
        （CC BY 4.0）を時刻表と照合して使用しています。
      </p>
      <p>
        関東の駅・所属路線：
        <a href={KANTO_API_DOCS} target="_blank" rel="noreferrer">
          TERAREN 駅・路線情報API
        </a>
        。 元データは
        <a href={KANTO_DATA_TERMS} target="_blank" rel="noreferrer">
          駅データ.jp（株式会社バリューアンドビジョン）の利用規約
        </a>
        に従って利用し、Rairioが関東1都6県の駅の抽出・乗換駅の統合・補助経路の作成を行っています。
        駅データ.jpのデータには同社の利用規約が適用されます。
      </p>
      <p>
        山手線の駅順は
        <a href={YAMANOTE_ORDER_SOURCE} target="_blank" rel="noreferrer">
          JR東日本の路線図
        </a>
        を参照しています。
        <a
          href={`${import.meta.env.BASE_URL}licenses/data-sources.txt`}
          target="_blank"
          rel="noreferrer"
        >
          データの出典・加工内容・利用条件
        </a>
        。
      </p>
    </>
  );
}

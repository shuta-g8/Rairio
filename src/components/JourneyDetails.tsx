import type { JourneyData } from '../../shared/journey';
import { useState } from 'react';
import { KANTO_NETWORK } from '../lib/kanto-network';
import { AnimatedDetails } from './AnimatedDetails';
import { JourneyDataCredits } from './JourneyDataCredits';

export function JourneyDetails({ data }: { data?: JourneyData }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <AnimatedDetails
      className="journey-details"
      expanded={expanded}
      onToggle={() => setExpanded((current) => !current)}
      summary="対応範囲・案内について"
      keepMounted
    >
      <ul>
        <li>
          関東1都6県の鉄道駅から検索できます。出発・到着の片方は東京都交通局の駅を指定してください。
        </li>
        <li>
          オンライン検索の時刻と経路はTransitousの収録データに基づきます。経路が収録されていない区間や日時があります。
        </li>
        <li>
          オフラインの補助案内は、都営地下鉄の収録時刻表と駅・路線データを使います。他社線の接続や時刻は未確認です。
        </li>
        <li>
          「運賃を表示」を押すと、経路が照合できた候補の大人1人分の参考運賃を表示します。オフラインの補助案内は都営地下鉄区間の運賃を表示します。
        </li>
      </ul>
      <JourneyDataCredits />
      <p>
        関東の駅データは{KANTO_NETWORK.stations.length.toLocaleString()}駅グループ・
        {KANTO_NETWORK.lines.length}路線、取得日 {KANTO_NETWORK.fetchedAt.slice(0, 10)}
        。新幹線は対象外です。駅名の読みが未収録の駅は漢字で検索してください。
      </p>
      {data && (
        <p>
          時刻表版：{data.feedVersion} ／ 取得日：{data.fetchedAt.slice(0, 10)} ／ 収録期間：
          {data.startDate}〜{data.endDate}
        </p>
      )}
      {data?.lineEndDates.Asakusa && (
        <p>
          浅草線は{data.lineEndDates.Asakusa}以降の営業日の列車時刻を未収録のため案内しません。
          その他の路線も、時刻表の収録期間外は時刻付き案内を行いません。
        </p>
      )}
    </AnimatedDetails>
  );
}

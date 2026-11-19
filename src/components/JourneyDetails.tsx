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
        <li>都営地下鉄4路線・99駅に対応。都営区間は最大3回の列車乗換まで検索します。</li>
        <li>
          検索は関東1都6県の駅に対応しています。他社線内は所属路線・乗換駅から組み立てた補助案内で、運行時刻・停車駅・直通列車の接続は未確認です。途中で列車の変更が必要な場合があります。
        </li>
        <li>
          乗換時間はRairioの目安です（都営の路線間8分、蔵前10分、同一路線の列車変更2分）。改札や歩く速さによって異なります。
        </li>
        <li>表示は通常ダイヤの予定時刻です。遅延・運休、臨時列車は反映しません。</li>
        <li>
          運賃は大人1人の都営区間の普通運賃（IC・きっぷ）です。定期券・企画券・他社との乗継割引・クレジットカードのタッチ決済は考慮しません。
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

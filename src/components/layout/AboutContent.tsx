import { ArrowUpRightIcon } from '@phosphor-icons/react/dist/csr/ArrowUpRight';
import { ClockIcon } from '@phosphor-icons/react/dist/csr/Clock';
import { TrainSimpleIcon } from '@phosphor-icons/react/dist/csr/TrainSimple';
import { version as appVersion } from '../../../package.json';
import { TAGLINE } from '../../lib/brand';
import { DATA_PROVIDER, DATA_LICENSE, TIMETABLE_SOURCE } from '../../../shared/transit-source';
import { Logo } from '../Logo';
export function AboutContent() {
  return (
    <div className="about-content">
      <span className="about-brand">
        <Logo width={156} />
      </span>
      <p className="about-name">
        レイリオ<span>Railway ＋ Rio（川）</span>
        <data value={appVersion}>v{appVersion}</data>
      </p>
      <h3>{TAGLINE}</h3>
      <p>
        Rairioは、都営地下鉄の発車案内を、駅の電光掲示板を思わせる表示で確認できるアプリです。
        次の電車までの時間、一日分の時刻表、運行情報をまとめて確認。
        名前に込めた「Rio（川）」のように、日々の移動がなめらかにつながるよう、出発のタイミングを考えるお手伝いをします。
      </p>
      <div className="about-features">
        <div className="about-feature">
          <TrainSimpleIcon size={22} aria-hidden="true" />
          <div>
            <h4>いつもの駅も、気になる駅も。</h4>
            <p>
              駅を切り替えて、行先や発車時刻を眺める。電光掲示板を思わせる表示で、各駅を行き交う電車を身近に感じられます。電車に乗るときも、発車案内を眺めたいときも、気軽に開いてみてください。
            </p>
          </div>
        </div>
        <div className="about-feature">
          <ClockIcon size={22} aria-hidden="true" />
          <div>
            <h4>次の電車がわかると、動き方が決まる。</h4>
            <p>
              家を出る前に発車時刻を確かめたり、少し先の電車を時刻表で探したり。運行情報とあわせて確認することで、自分のペースで出発のタイミングを考えられます。保存済みの時刻表は、オフラインでも利用できます。
            </p>
          </div>
        </div>
      </div>
      <p>
        Rairioは、鉄道事業者や情報提供元が運営する公式サービスではありません。
        情報の出典とフォントの権利表示は以下をご確認ください。
      </p>
      <p className="about-source">
        都営の時刻表・運行情報：
        <a href={TIMETABLE_SOURCE} target="_blank" rel="noreferrer">
          {DATA_PROVIDER}
        </a>
        <br />
        <a href={DATA_LICENSE} target="_blank" rel="noreferrer">
          CC BY 4.0
        </a>{' '}
        ／ 時刻表を本アプリ用に変換・編集しています。
        <br />
        <a
          href={`${import.meta.env.BASE_URL}licenses/data-sources.txt`}
          target="_blank"
          rel="noreferrer"
        >
          関東の駅データなど、出典・加工内容・利用条件一覧
        </a>
        <br />
        発車案内掲示板のフォント：
        <a href="https://seed.line.me/index_jp.html" target="_blank" rel="noreferrer">
          LINE Seed JP
          <ArrowUpRightIcon size={12} aria-hidden="true" />
        </a>{' '}
        / SIL Open Font License 1.1
        <br />
        <a
          href={`${import.meta.env.BASE_URL}licenses/third-party-notices.txt`}
          target="_blank"
          rel="noreferrer"
        >
          ライセンス・著作権表示
          <ArrowUpRightIcon size={12} aria-hidden="true" />
        </a>
        <br />
        対象は都営浅草線・三田線・新宿線・大江戸線の全99駅（路線ごとの延べ106駅）です。他社線内の駅の時刻表は含みません。
      </p>
    </div>
  );
}

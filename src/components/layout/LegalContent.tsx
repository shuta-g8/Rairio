import {
  DATA_PROVIDER,
  DATA_LICENSE,
  TIMETABLE_SOURCE,
  OPERATIONS_CATALOG,
  STATION_BASICS_SOURCE,
  STATION_INFO_SOURCE,
} from '../../../shared/transit-source';
import { JourneyDataCredits } from '../JourneyDataCredits';

type LegalSection = 'privacy' | 'licenses';

const noticesUrl = `${import.meta.env.BASE_URL}licenses/third-party-notices.txt`;
const fontLicenseUrl = `${import.meta.env.BASE_URL}licenses/line-seed-jp.txt`;
const logoFontLicenseUrl = `${import.meta.env.BASE_URL}licenses/outfit.txt`;

export function LegalContent({ section }: { section: LegalSection }) {
  const privacy = section === 'privacy';
  return (
    <div className="legal-content">
      {privacy ? (
        <>
          <p>最終更新：2026年11月20日</p>
          <p>
            Rairioには、氏名・住所などを入力するフォームや、広告・独自のアクセス解析はありません。
            配信サーバーには、ページやデータを表示するための通信情報が届きます。
          </p>
          <h3>この端末に保存する情報</h3>
          <p>
            前回選択した駅、発車案内の表示モード、最近検索して選んだ駅（ヘッダーは最大3件、経路案内は最大5件）、登録した駅（最大5件）、取得した時刻表・運行情報をブラウザーに保存します。
            オフライン機能を利用できる環境では、表示用ファイルも保存します。
            駅の復元と、通信できないときの表示に使用します。
          </p>
          <p>
            選択した駅は、共有用URLや時刻表データのリクエストにも含まれます。
            駅の選択履歴を収集するための専用の送信は行っていません。
            保存した情報は、ブラウザーの設定からこのサイトのデータを削除すると消去できます。
          </p>
          <h3>現在地から駅を選ぶ機能</h3>
          <p>
            ブラウザーで位置情報の利用を許可した場合、現在地と都営駅の座標を端末内で比較し、近くの駅を選びます。
            取得した現在地の緯度・経度は、Rairioのサーバーへ送信せず、ブラウザーにも保存しません。
            選ばれた駅IDは、操作に応じて共有用URL、前回の駅・検索履歴の保存、時刻表の取得に使います。
            許可済みで駅指定のない訪問時には1回取得し、移動中の継続的な追跡は行いません。
            取得完了・失敗・時間切れ・手動操作・画面非表示やページ離脱時に位置情報の取得要求を解除し、画面復帰では自動再開しません。
            取得済みの近くの駅IDはページ内で保持し、経路の出発駅候補にも使用します。
            測位はブラウザーやOSが行い、その処理には各提供元の方針が適用されます。
            位置情報の利用許可はブラウザーの設定で変更できます。
          </p>
          <h3>Webフォントの配信</h3>
          <p>発車案内掲示板のLINE Seed JPは、このサイトから配信します。</p>
          <h3>乗換案内の検索</h3>
          <p>
            乗換検索では選んだ駅の座標と日時をTransitousに送ります。「運賃を表示」を押した場合は、同じ条件をNAVITIMEのAPIにも送ります。
          </p>
          <h3>外部サービスでの取り扱い</h3>
          <p>
            外部サービスによる情報の取り扱いや保存期間は、各社のポリシーとサービスの設定によります。
            リンク先の外部サイトを開いた場合も、そのサイトのポリシーが適用されます。
          </p>
        </>
      ) : (
        <>
          <h3>都営地下鉄の公開データ</h3>
          <p>
            提供：{DATA_PROVIDER}
            。時刻表・駅情報・種別・運行情報を利用しています。時刻表は本アプリ用の形式に変換し、土休日データの曜日への割り当て、行先情報の補完、表示用の名称への変換を行っています。
          </p>
          <p>
            <a href={DATA_LICENSE} target="_blank" rel="noreferrer">
              CC BY 4.0
            </a>
            {' ／ '}
            <a href={TIMETABLE_SOURCE} target="_blank" rel="noreferrer">
              時刻表の出典
            </a>
            {' ／ '}
            <a href={OPERATIONS_CATALOG} target="_blank" rel="noreferrer">
              運行情報の出典
            </a>
          </p>
          <p>
            駅名のよみ・住所・駅管理者は、東京都交通局「都営地下鉄駅基本情報」をCC BY
            4.0で利用し、駅番号で駅情報と照合しています。
            <a href={STATION_BASICS_SOURCE} target="_blank" rel="noreferrer">
              駅基本情報の出典
            </a>
          </p>
          <JourneyDataCredits />
          <p>
            駅番号・路線所属・駅の座標は、{DATA_PROVIDER}の
            <a href={STATION_INFO_SOURCE} target="_blank" rel="noreferrer">
              駅情報
            </a>
            （CC BY 4.0）を使用しています。駅の座標は現在地付近の駅の判定にも利用します。
          </p>
          <p>
            本アプリは東京都交通局・公共交通オープンデータ協議会の公式サービスではありません。データの更新状況や運行変更により、表示と実際の運行が異なる場合があります。
          </p>
          <p>
            Rairioでは、第三者のソフトウェアとフォントを使用しています。
            著作権表示と利用条件は、以下のライセンス文で確認できます。
          </p>
          <ul>
            <li>React・React DOM・Scheduler：MIT License</li>
            <li>Phosphor Icons：MIT License</li>
            <li>祝日データ：MIT License</li>
            <li>GSAP：Standard No Charge License</li>
            <li>LINE Seed JP：SIL Open Font License 1.1</li>
          </ul>
          <p>
            <a href={noticesUrl} target="_blank" rel="noreferrer">
              ソフトウェアのライセンス・著作権表示
            </a>
          </p>
          <p>
            <a href={fontLicenseUrl} target="_blank" rel="noreferrer">
              LINE Seed JPのライセンス全文
            </a>
          </p>
          <h3>Webフォント・ロゴ</h3>
          <p>Rairioのロゴとアイコンは、Outfit SemiBoldを使用して運営者が制作しています。</p>
          <p>
            <a href={logoFontLicenseUrl} target="_blank" rel="noreferrer">
              Outfitのライセンス全文
            </a>
            {' ／ '}
            <a href="https://gsap.com/community/standard-license/" target="_blank" rel="noreferrer">
              GSAPの利用条件
            </a>
          </p>
        </>
      )}
    </div>
  );
}

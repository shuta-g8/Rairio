# Rairio for 都営地下鉄

都営浅草線・三田線・新宿線・大江戸線の全99駅を対象にした非公式の発車案内です。駅ごとの発車時刻、一日分の時刻表、運行情報、乗換候補を表示します。位置情報を許可すると、端末内で近くの駅を選べます。

## ローカルで使う

Node.js 24 で次のコマンドを実行し、ブラウザーで `http://127.0.0.1:5173/` を開きます。

```sh
npm ci
npm run dev
```

ビルドとテストには `npm run check:quick` と `npm run build` を使います。ビルド後に `npm start` を実行すると、Node サーバーが `http://127.0.0.1:4173/` でアプリを配信します。

時刻表と乗換用の加工データを同梱しています。運行情報と列車位置は Node サーバーが東京都交通局の公開 API から取得します。この構成では列車位置を定期取得します。通常画面は端末のフォントを使い、発車案内掲示板ではアプリと同じサーバーから配信する LINE Seed JP を優先します。

## 乗換案内

関東1都6県の鉄道駅から選べます。出発・到着の少なくとも片方は、都営地下鉄、東京さくらトラム、日暮里・舎人ライナーの駅・停留場を選びます。オンラインで案内できる区間や日時は Transitous の収録範囲に依存します。

軽いローカル試作で Transitous を使う場合は、起動前に環境変数 `JOURNEY_TRANSITOUS_ENABLED=1` を設定します。結果にある「運賃を表示」は、NAVITIMEで同じ経路と照合できた候補の参考運賃を取得します。運賃の連携には RapidAPI Basic の契約とサーバー側の設定が必要です。 [Transitous API 利用ポリシー](https://transitous.org/api/) · [NAVITIME RapidAPI 利用規約](https://api-sdk.navitime.co.jp/api/specs/description/rapid_tou.html)

## データとライセンス

Rairio の自作ソースコードには [MIT License](LICENSE) を適用します。ロゴ・シンボルなどのブランド素材は自作コードの許諾範囲から除きます。

- 都営の時刻表・駅情報・運行情報などは東京都交通局・公共交通オープンデータ協議会が提供する CC BY 4.0 のデータを加工しています。
- 関東の駅・路線には TERAREN の API を通じて取得した駅データ.jp のデータを加工して使っています。提供元と加工内容は [データ出典一覧](public/licenses/data-sources.txt) に記載しています。
- オンラインの経路・時刻は [Transitous のデータ出典](https://transitous.org/sources/) に掲載されているデータを使用しています。© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)。
- LINE Seed JP とロゴの制作に使われた Outfit には SIL Open Font License 1.1 が適用されます。GSAP は独自の Standard License で提供される外部依存です。祝日データ、アイコン、ソフトウェアの著作権表示と利用条件は [ライセンス一覧](public/licenses/) に収録しています。

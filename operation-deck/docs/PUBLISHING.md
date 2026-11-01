> 公開時追記（2026-11-01）：本人の公開指示により、この公開候補を creative-workflow-portfolio に収録しました。以下の公開前記録は準備時点の履歴です。配布ライセンスは未付与です。

# 公開予定と確認事項

公開対象はこのフォルダのファイルだけです。親リポジトリ全体・そのGit履歴をコピーして公開しません。

- index.html：外部API取得と私的リンクを除去したデモ。
- sample.json：合成9カード。
- README.md：利用方法、背景、本人/AIの役割、制約。
- docs/DESIGN.md：設計と状態の意味。
- docs/VALIDATION.md、docs/validation.json：今回の実測検証。
- docs/screenshots/desktop.png、mobile.png：合成画面。
- tests/browser.cjs：開発用のブラウザ回帰試験。
- tests/static_check.py：公開対象の禁止参照検査。
- package.json：任意のテスト依存とコマンド。
- public-files.json：公開対象のファイル名とSHA256（この一覧自身はhash対象外）。

実データ、実サービスのURL/ID、トークン、制作素材、元repoの履歴は含めません。

## 最後に決めること

1. 公開先リポジトリ名/所有者と、掲載する本人の名前。
2. 配布ライセンス。現段階では未付与。
3. READMEとデモ画面の本人確認。

現在は公開前の候補であり、公開pushやprivate repoの可視性変更は実施していません。

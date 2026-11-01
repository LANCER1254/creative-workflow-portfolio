# 限定検証

2026-10-27、Chromium 154 / Puppeteer 25.12.0によるheadless実ブラウザで1440×1000と390×1000を確認。3ツール×2幅の6組合せがPASS。機能群ごとの結果はvalidation-storyboard.json、validation-background.json、validation-writing.jsonに記録しています。模擬SDK結果ではありません。

| デモ | 確認した動作 |
|---|---|
| 絵コンテ | 3コマ起動、編集、並べ替え、シート、実ダウンロードJSONの別ページ復元一致、HTMLエスケープ、不正JSON/外部画像/破損PNGで元入力保持 |
| 背景 | 3背景、状態編集→ブラウザ保存→再読一致、実ダウンロードJSONの空context復元一致、HTMLエスケープ、不正入力保持、別タブ更新拒否、容量不足の失敗表示 |
| 執筆 | 5章/脱稿1/執筆2/確認1/期限未設定2、工程絞込、合成プロット表示、JSON往復、空章/欠落manifest拒否、HTML/Markdownを文字列表示 |

各幅で文書全体の横はみ出し、JS例外、外部ネットワーク・live API・HTTP書込要求も検査。執筆の表は横スクロールで工程/期限欄を読む設計です。画面例はscreenshots/。背景の淡色面と文字のコントラストを修正し、編集部分も目視しました。

## 再実行

Node.jsとPuppeteer 25.12.0/対応Chromiumを別途用意してください。アプリ閲覧にはNode/Puppeteer不要です。既存のPuppeteerを使う場合はPUPPETEER_MODULEにそのモジュールパスを指定できます。

```
node tests/browser.cjs storyboard
node tests/browser.cjs background
node tests/browser.cjs writing
```

試験は自分で一時loopback HTTPと隔離browser contextを起動し、終了時に閉じます。検証JSONと画面例をdocsへ再出力します。Linuxのsandbox制約に合わせheadless試験に--no-sandboxを使っています。

## 未確認・境界

実機スマホ・Safari/Firefox・タッチドラッグ・印刷出力の本人受入は未確認です。file直開きはES modulesのため非対応。執筆は閲覧専用で工程編集なし。集計は登録入力だけが母数で、資料の未確認表示も正式確認済みに置き換えません。localStorageの手動消去/ブラウザ変更に備えJSONを保存してください。

技術PASSは本人表示受入・公開許可・ライセンス確定とは別です。自動試験は原典アプリ全体の回帰保証ではなく、この合成公開準備版の限定範囲です。

# 再利用範囲と今回の変更

原典は本人の既存制作ツールをREADして確認。元ファイルは変更せず、専用の隔離作業先で公開候補を作成しました。全体の著作権/配布許諾を本資料だけで確定するものではありません。

| ツール | 原典・再利用 | 今回の変更 |
| --- | --- | --- |
| Memo Petal | meritocracia-completeのmemo_petal/index.html。付箋編集・移動・チェック・Archive・JSON操作 | 実API/私的リンク/個人用シードを除去、合成2枚、保存キー分離、検証付JSON復元・別タブ競合拒否。非表示になったDOMのResizeObserverが幅0を保存する問題をこの派生版で修正 |
| 付箋カンバン | meritocracia-renpy tools/schedule_flow_mockのHTML/CSS、sticky_kanban.js、reservation_model.js、fusion_model.js、meeting_state.js | 合成3カード、ブラウザ内の版照合/Web Locks保存、明示JSON出力/復元、実API/ポーリング/クラウド/私的リンクの除去。予約や会議の記録操作は実作業の自動実行ではない |
| Character Size Viewer | meritocracia-renpy docs/character_size_viewerのmodels/calculator/image_loader/renderer/ui/appとHTML/CSS | 身長比計算は再利用。図形3体のサンプル、比較条件だけのJSON往復、用途説明と狭幅表示を追加 |

本体のバグ修正反映、既存機能全体の本番同等性、実タッチ操作、外部同期、任意PNGを含む比較セッションの保存は今回の完了範囲に含みません。

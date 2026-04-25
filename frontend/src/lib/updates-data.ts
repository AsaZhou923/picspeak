export type UpdateLocale = 'zh' | 'en' | 'ja';

export interface ProductUpdateSection {
  title: string;
  items: string[];
}

export interface ProductUpdateEntry {
  id: string;
  date: string;
  title: string;
  summary: string;
  docPath: string;
  sections?: ProductUpdateSection[];
}

export function getProductUpdates(locale: UpdateLocale): ProductUpdateEntry[] {
  if (locale === 'ja') {
    return [
      {
        id: '2026-04-24-stage-d-content-conversion',
        date: '2026-04-24',
        title: 'コンテンツ流入から評価ワークスペースへの導線を追加',
        summary:
          'Blog、Gallery、ホームから目的別にワークスペースへ戻れる入口を追加し、コンテンツ閲覧からクリック、アップロード、初回評価完了まで追える週次レポート口径を整えました。',
        docPath: 'docs/changelog/update-log-2026-04-24-stage-d-content-conversion.md',
        sections: [
          {
            title: 'ワークスペース入口',
            items: [
              'Blog 記事末尾の CTA が記事テーマに合わせた同種評価とアップロード入口を出すようになった',
              'Gallery カードに同じ題材で練習する入口と、同じ基準で自分の写真を評価する入口を追加',
              'ホームに新規ユーザー、再訪ユーザー、記事読者向けの3つの開始入口を追加',
            ],
          },
          {
            title: '転換計測',
            items: [
              '`content_workspace_clicked` イベントで Blog / Gallery からのワークスペースクリックを記録',
              '週次レポートで閲覧、クリック、ワークスペース到達、アップロード、初回評価完了を Blog / Gallery 別に集計',
              'API 監査ログはヘルスチェック等を除外し、同期 DB 書き込みでリクエストを塞がないようにした',
            ],
          },
        ],
      },
      {
        id: '2026-04-22-pro-conversion-and-faq-schema',
        date: '2026-04-22',
        title: 'Pro 価値訴求の再設計と FAQPage 重複修正',
        summary:
          'Pro を「より深い分析」ではなく、次回撮影ガイド・完全な振り返り・上達追跡として再整理しました。あわせて /zh・/en・/ja ホームの FAQPage 構造化データ重複を修正しました。',
        docPath: 'docs/changelog/update-log-2026-04-22-pro-conversion-and-faq-schema.md',
        sections: [
          {
            title: 'Pro 価値訴求',
            items: [
              'Free / Pro の境界を「素早い診断」と「次回撮影ガイド」に再定義',
              'レビュー詳細、履歴、Usage ページの Pro 訴求を同じ戦略辞書から生成',
              'Usage ページにアップグレード後の違いを比較する判断パネルを追加',
            ],
          },
          {
            title: 'SEO 構造化データ',
            items: [
              'locale ホームで HomePage の FAQPage JSON-LD を二重出力しないように変更',
              '/zh・/en・/ja の FAQPage は locale layout 側の 1 件に統一',
            ],
          },
        ],
      },
      {
        id: '2026-04-20-review-growth-loop-and-replay-guidance',
        date: '2026-04-20',
        title: '成長ループ、再評価ガイド、次回チェックリスト',
        summary:
          '履歴ページで直近 3 回の伸びを見比べられるようにし、レビュー詳細では「同じ写真で再評価」と「新しく撮り直す」を分けて案内します。Flash の提案も次回の撮影チェックリストにしやすい形へ整理しました。',
        docPath: 'docs/changelog/update-log-2026-04-20-review-growth-loop-and-replay-guidance.md',
        sections: [
          {
            title: '成長ループ',
            items: [
              '履歴ページに直近 3 回とその前 3 回の平均比較、上向き・下振れ・横ばいの傾向を追加',
              '7 点未満が続く次元をまとめ、どこが繰り返し弱いか先に見えるようにした',
              '直近 3 件の講評からそのまま詳細へ戻れる',
            ],
          },
          {
            title: '次の一枚への導線',
            items: [
              'レビュー詳細に「同じ写真で修正確認」と「新しい写真で撮り直す」の 2 つの進め方を追加',
              '提案文から最大 3 つの Next-Shoot Checklist を抽出し、Action / Observation / Reason を表示',
              'ワークスペースの再評価バナーも、未編集写真なら撮り直しを優先すべきだと明示',
            ],
          },
          {
            title: '回帰保護',
            items: [
              'Header の認証専用ナビは hydration 後まで非表示にして、ログイン状態のチラつきを抑制',
              'prompt、文言、成長スナップショット、header 可視性のテストを追加',
            ],
          },
        ],
      },
      {
        id: '2026-04-19-auth-hardening-and-request-stability',
        date: '2026-04-19',
        title: '認証強化・タスクリトライ整理・リクエスト安定化',
        summary:
          'CORS、Cookie、Webhook、JWKS キャッシュ、タスクエラー公開範囲、フロントエンドのリクエスト中断をまとめて整え、認証まわりと API 呼び出しの安定性を上げました。',
        docPath: 'docs/changelog/update-log-2026-04-19-auth-hardening-and-request-stability.md',
        sections: [
          {
            title: '認証と API 保護',
            items: [
              'CORS の許可メソッドとヘッダーを明示し、X-Device-Id も許可',
              'guest cookie の SameSite を環境別に整理し、Webhook の 409/401/403 応答を是正',
              'アクティベーションコード引き換えにユーザー単位のレート制限を追加',
            ],
          },
          {
            title: '安定性と回帰防止',
            items: [
              'JWKS キャッシュにロックを入れて並行更新を抑制',
              'AI 呼び出し前にクォータを確認し、タスク失敗メッセージを外部向けにサニタイズ',
              'AbortController で詳細・使用量・タスク polling の取消しを実装',
            ],
          },
        ],
      },
      {
        id: '2026-04-19-backend-frontend-module-split',
        date: '2026-04-19',
        title: 'バックエンド・フロントエンドのモジュール分割リファクタリング',
        summary:
          '肥大化していたバックエンドルーターとフロントエンドページを単一責任の小モジュールに分割し、コードの可読性と保守性を向上させました。ユーザー向けの機能変更はありません。',
        docPath: 'docs/changelog/update-log-2026-04-19-backend-frontend-module-split.md',
        sections: [
          {
            title: 'バックエンドルーター分割',
            items: [
              '3000行超の routes.py モノリスを削除、全ドメインルーターが api/routers/ へ移行完了',
              'reviews.py（980行）を作成・操作・クエリ・共通支援の4モジュールに分割',
              'auth.py と gallery.py の補助ロジックをそれぞれ _support ファイルに抽出',
            ],
          },
          {
            title: 'フロントエンドコンポーネント分割',
            items: [
              'レビュー詳細ページを ~390行から ~93行に圧縮、ロジックを features/reviews/ へ移動',
              '6つの専用コンポーネントと5つのカスタムフックを新設',
              'useUploadFlow のユーティリティ関数を uploadFlowSupport.ts へ抽出',
            ],
          },
        ],
      },
      {
        id: '2026-04-13-blog-view-counts',
        date: '2026-04-13',
        title: 'ブログ記事の閲覧回数表示を追加',
        summary:
          'ブログ記事ごとの閲覧回数を公開表示し、記事詳細を開いたときに自動で 1 回加算される仕組みを追加しました。',
        docPath: 'docs/changelog/update-log-2026-04-13-blog-view-counts.md',
        sections: [
          {
            title: '閲覧数の記録',
            items: [
              '記事 slug ごとに閲覧数を保存する blog_post_views テーブルと公開 API を追加',
              '記事詳細ページを開くと閲覧数が自動で増えるように実装',
            ],
          },
          {
            title: '表示の反映',
            items: [
              'ブログ一覧、注目記事、関連記事、記事詳細ヘッダーに閲覧回数を表示',
              '短時間の連続加算を避けるため、同一セッションでは 5 秒の節流を追加',
            ],
          },
        ],
      },
      {
        id: '2026-04-12-llms-seo-schema',
        date: '2026-04-12',
        title: 'llms.txt 導入・Schema.org 拡張・多言語 Updates ページ追加',
        summary:
          'AI 検索エンジン向け llms.txt を新設、Person・SoftwareSourceCode 等 の構造化データを補完し、Updates ページも /zh・/en・/ja ルートで公開開始。',
        docPath: 'docs/changelog/update-log-2026-04-12-llms-seo-schema.md',
        sections: [
          {
            title: 'AI 可視性（llms.txt）',
            items: [
              '/llms.txt と /.well-known/llms.txt を新設し、製品概要・価格・ブログ・主要 URL を構造化',
              'siteConfig に author・social・repositoryUrl を追加し、Schema と llms.txt で共用',
            ],
          },
          {
            title: 'Schema.org 拡張',
            items: [
              'ホーム・ブログ・記事ページに Person（作者）・SoftwareSourceCode スキーマを追加',
              'Blog・BlogPosting に author（@id 参照）・publisher・isPartOf を付与',
            ],
          },
          {
            title: '多言語 Updates ページ',
            items: [
              '/[locale]/updates ルートを追加し、各言語専用の更新履歴ページを提供',
              'UpdatesPageContent を共通コンポーネント化し、homeHref で遷移先を制御',
            ],
          },
        ],
      },
      {
        id: '2026-04-11-blog-gallery-sort-theme',
        date: '2026-04-11',
        title: 'ブログ・ギャラリーソート・ダークテーマを追加',
        summary:
          '6 本の三言語ブログ記事を公開し、ギャラリーに4種ソートを追加。ダークモード配色を暖色系へ調整しました。',
        docPath: 'docs/changelog/update-log-2026-04-11-blog-gallery-sort-theme.md',
        sections: [
          {
            title: 'ブログモジュール',
            items: [
              '中・英・日 6 本の SEO 記事を収録したブログを新設し、ナビ・フッター・ホームに導線を追加',
              'sitemap に全言語のブログ記事 URL と hreflang を追加',
              '言語切り替え時、locale 付き URL も正しく遷移するように改善',
            ],
          },
          {
            title: 'ギャラリーソート',
            items: [
              'ギャラリーに推薦・最新・高評価・人気の 4 種ソートを追加',
              'バックエンドのソート対応とフロントエンドの UI を同時に実装',
            ],
          },
          {
            title: 'テーマとスタイル統一',
            items: [
              'ダークモードを暖色系に調整し、ハードコーディングされた色値を CSS 変数へ統一',
              'リバースプロキシ環境で画像 URL が正しく HTTPS を返すよう修正',
            ],
          },
        ],
      },
      {
        id: '2026-04-10-locale-seo-and-gallery-refactor',
        date: '2026-04-10',
        title: '多言語ホーム導線、SEO ルーティング、ギャラリー構成を刷新',
        summary:
          '/zh・/en・/ja の言語固定ホームを追加し、hreflang・JSON-LD・sitemap を整備しました。あわせてギャラリー、ホーム、レビュー、ワークスペースの文言を i18n に集約し、ギャラリー画面を部品化して保守しやすくしました。',
        docPath: 'docs/changelog/update-log-2026-04-10-locale-seo-and-gallery-refactor.md',
        sections: [
          {
            title: '言語固定ホームと SEO',
            items: [
              '/zh・/en・/ja を追加し、URL から表示言語を固定したホームを直接開けるようにした',
              '各言語ホームに個別 metadata、keywords、JSON-LD、hreflang を付与',
              'sitemap と公開ページ metadata に alternate languages を追加し、検索エンジン向けの言語シグナルを補強',
            ],
          },
          {
            title: '画面文言と UI 整理',
            items: [
              'ホームの価格表示・更新履歴・連絡先文言を翻訳辞書へ移し、最新アップデート導線も今週の更新内容に差し替え',
              'ワークスペースの再分析カード、レビューの favorites 導線、Pro 訴求カードを三言語共通の i18n キーへ統一',
              'ギャラリーページのフィルター、カード、ページネーションを分割コンポーネント化し、既存 UI を維持したまま保守しやすくした',
            ],
          },
        ],
      },
      {
        id: '2026-04-09-gallery-ranking-and-quality-gates',
        date: '2026-04-09',
        title: '公開ギャラリー順位付け、画像表示、Lint 基盤を調整',
        summary:
          '公開ギャラリーをスコア優先かつ新しさも加味する順位付けに更新し、安定したページングカーソルへ切り替えました。あわせてギャラリー画像表示の不具合を修正し、フロントエンドの lint 実行基盤を整備しました。',
        docPath: 'docs/changelog/update-log-2026-04-09-gallery-ranking-and-quality-gates.md',
        sections: [
          {
            title: '公開ギャラリー順位付け',
            items: [
              'ギャラリーを公開日時のみではなく、スコアをやや強めに重視した複合順位で並べ替えるように変更',
              'スコアが近い作品では新しい公開作品が前に出やすくなるよう時間減衰を導入',
              '複合順位でも崩れないよう、次ページカーソルを順位スコア・公開日時・ID の組み合わせへ更新',
            ],
          },
          {
            title: '表示安定性と品質ゲート',
            items: [
              '開発環境の `localhost:8000` 画像ソースを許可し、`next/image` のホスト未設定エラーを解消',
              'ギャラリーカード画像は表示安定性を優先してネイティブ `img` に戻し、縮略画像が出ない問題を修正',
              'ESLint 設定を追加し、`npm run lint` が対話モードに入らず継続実行できるようにした',
            ],
          },
        ],
      },
      {
        id: '2026-04-07-activation-code-billing',
        date: '2026-04-07',
        title: 'アクティベーションコード開通と中国向け購入導線を追加',
        summary:
          '中国語ユーザー向けに愛発電とアクティベーションコードによる Pro 開通フローを追加し、期限同期と失効時のプラン反映も補強しました。',
        docPath: 'docs/changelog/update-log-2026-04-07-activation-code-billing.md',
        sections: [
          {
            title: 'アクティベーションコード基盤',
            items: [
              'アクティベーションコード用テーブル、redeem API、30 日 Pro 付与ロジックを追加',
              '有効期限が残っている手動 Pro は、その末尾に 30 日を加算して延長',
              '認証時と webhook 時で同じ購読判定を使い、期限切れプランを正しく free / guest に戻すようにした',
            ],
          },
          {
            title: '中国語向け購入とアカウント表示',
            items: [
              '中国語環境の購入ボタンを愛発電導線に切り替え、購入後はサイト内でコードを入力して開通できるようにした',
              '利用状況ページにアクティベーションコード案内、入力モーダル、無自動更新の表示を追加',
              'アクティベーションコード由来の Pro では、購読管理の代わりに更新導線を表示',
            ],
          },
          {
            title: 'ページ導線と補足整備',
            items: [
              'ホーム定価区、Pro 訴求カード、レビュー詳細、利用状況ページにコード入力導線を追加',
              'アクティベーションコード生成スクリプトとバックエンドテストを追加',
              'レビュー詳細の補助ロジックを別モジュールへ分離し、本番ビルドはメモリキャッシュを使用するように調整',
            ],
          },
        ],
      },
      {
        id: '2026-04-01-audit-score-gallery-polish',
        date: '2026-04-01',
        title: '審査基準・スコア表現・ギャラリー表示を調整',
        summary:
          '公開ギャラリーの審査を過度に厳しくしすぎないよう見直し、レビュー結果のスコア文言を 10 段階に細分化し、ギャラリーカードの横写真表示を安定化しました。',
        docPath: 'docs/changelog/update-log-2026-04-01-audit-score-gallery-polish.md',
        sections: [
          {
            title: '公開ギャラリー審査',
            items: [
              '審査 prompt を「明確な違反のみ unsafe」とする方針に更新',
              '水着、ファッション、非露点の密着衣装、芸術的な人体表現などは通常 safe 扱いに調整',
              '判断が曖昧な場合は safe 寄りに倒し、公開ギャラリーでの誤ブロックを減らした',
            ],
          },
          {
            title: 'レビュー結果の表現',
            items: [
              '最終スコアを 1 から 10 の整数帯に丸めて専用ラベルへマッピング',
              '日本語・英語・中国語で 10 段階のスコア文言を追加',
            ],
          },
          {
            title: 'ギャラリー表示',
            items: [
              'ギャラリーカードを `object-contain` ベースに統一し、横写真の切り抜きを回避',
              '審査 prompt の回帰テストと `.vercel` / ローカル環境ファイルの ignore も追加',
            ],
          },
        ],
      },
      {
        id: '2026-03-28-home-review-gallery-refresh',
        date: '2026-03-28',
        title: 'ホーム・レビュー・ギャラリー体験を一括で調整',
        summary:
          'ホームのヘッダー統一、サインアップ導線の追加、レビュー詳細の表示修正、公開ギャラリーのページングとサムネイル運用をまとめて改善しました。',
        docPath: 'docs/changelog/update-log-2026-03-28-home-review-gallery-refresh.md',
        sections: [
          {
            title: 'ホーム体験',
            items: [
              'ホームのヘッダーをアプリ標準の見た目に統一',
              'ログインに加えてサインアップ導線を追加し、アバター表示と Pro カードの tips 切れも修正',
              'FAQ、認証導線、背景演出は引き続き遅延マウントで首屏負荷を抑制',
            ],
          },
          {
            title: 'レビュー詳細',
            items: [
              '1 件の改善提案が記号で複数カードに分裂する問題を修正',
              'レビュー詳細ではローカルのアップロードプレビューを優先して画像欠落を減少',
            ],
          },
          {
            title: '公開ギャラリー',
            items: [
              '先頭 / 末尾 / ページ番号ジャンプを含むページング UI を追加',
              '公開ギャラリー用サムネイルの生成・長期キャッシュ・回填スクリプトを追加',
            ],
          },
        ],
      },
      {
        id: '2026-03-27-gallery-navigation-and-filters',
        date: '2026-03-27',
        title: '公開ギャラリーの復元と絞り込みを強化',
        summary:
          '公開ギャラリーに履歴ページと同じ絞り込みを追加し、URL 同期、戻る復元、サムネイル読み込み整理までまとめて補強しました。',
        docPath: 'docs/changelog/update-log-2026-03-27-gallery-navigation-and-filters.md',
        sections: [
          {
            title: 'ギャラリー絞り込み',
            items: [
              '公開ギャラリーに開始日・終了日・最小スコア・最大スコア・写真タイプの絞り込みを追加',
              '絞り込み UI は履歴ページと同じ操作モデルに統一',
              'バックエンドの `/gallery` も同じ条件で結果と件数を返すように更新',
            ],
          },
          {
            title: '戻る動作と履歴復元',
            items: [
              '詳細に入る前のページ、読み込み済みカード、スクロール位置を保存',
              '戻るボタンとブラウザの前進/後退の両方で現在のギャラリー状態を復元',
              '復元状態は現在の絞り込み条件ごとに分離し、別の結果セットと混ざらないようにした',
            ],
          },
          {
            title: '画像読み込み整理',
            items: [
              'ギャラリーカードは原寸画像ではなく `photo_thumbnail_url` のみを使用',
              'カード表示のために原寸画像を先に取りにいかないよう整理',
              '画質は維持しつつ、一覧表示の帯域消費を抑制',
            ],
          },
        ],
      },
      {
        id: '2026-03-25-pro-launch-checkout',
        date: '2026-03-25',
        title: 'Pro 初回キャンペーンと直接チェックアウトを整理',
        summary:
          'Pro の初回価格表現を統一し、各ページの導線を補強し、購入ボタンを直接チェックアウトに接続しました。',
        docPath: 'docs/changelog/update-log-2026-03-25-pro-launch-checkout.md',
      },
      {
        id: '2026-03-24-score-upgrade',
        date: '2026-03-24',
        title: '新しい採点口径とギャラリー推薦表示を導入',
        summary:
          'flash と pro の採点口径を揃え、公開ギャラリーに score version と推薦ロジックを追加しました。',
        docPath: 'docs/changelog/update-log-2026-03-24-score-upgrade.md',
      },
      {
        id: '2026-03-22-gallery-likes',
        date: '2026-03-22',
        title: '公開ギャラリーのいいねと SEO を追加',
        summary:
          '公開ギャラリーに永続化されたいいねを追加し、同時に公開ページの SEO 設定も整えました。',
        docPath: 'docs/changelog/update-log-2026-03-22-gallery-likes.md',
      },
      {
        id: '2026-03-21-strict-scoring',
        date: '2026-03-21',
        title: '厳しめの採点 prompt とギャラリー総数表示を修正',
        summary:
          'AI 採点 prompt を引き締め、公開ギャラリーの総件数表示が先頭ページでも正しく出るように修正しました。',
        docPath: 'docs/changelog/update-log-2026-03-21-strict-scoring.md',
      },
      {
        id: '2026-03-20-gallery',
        date: '2026-03-20',
        title: '公開ギャラリーの閲覧・審査・ページングを整備',
        summary:
          '公開ギャラリーを本格導入し、審査、ゲスト閲覧、長廊カード、ページング体験をまとめて整えました。',
        docPath: 'docs/changelog/update-log-2026-03-20-gallery.md',
      },
      {
        id: '2026-03-20-history-and-favorites',
        date: '2026-03-20',
        title: '履歴・共有・再分析・お気に入りを接続',
        summary:
          '履歴ページの絞り込み、共有、エクスポート、再分析、お気に入りを前後端でつなぎ込みました。',
        docPath: 'docs/changelog/update-log-2026-03-20.md',
      },
    ];
  }

  if (locale === 'en') {
    return [
      {
        id: '2026-04-24-stage-d-content-conversion',
        date: '2026-04-24',
        title: 'Content-to-workspace conversion paths',
        summary:
          'Blog, Gallery, and Home now send readers back to the workspace with intent-specific CTAs, while the analytics snapshot can track content views through clicks, uploads, and first critique completion.',
        docPath: 'docs/changelog/update-log-2026-04-24-stage-d-content-conversion.md',
        sections: [
          {
            title: 'Workspace entrances',
            items: [
              'Blog article CTAs now match the article topic and carry source, entrypoint, content slug, and image type',
              'Gallery cards now offer same-subject practice and a same-standard critique path for the viewer photo',
              'Home now separates new-user, returning-user, and content-reader starting paths',
            ],
          },
          {
            title: 'Conversion reporting',
            items: [
              '`content_workspace_clicked` records Blog / Gallery workspace intent before the user reaches the product flow',
              'Weekly reporting breaks down views, clicks, workspace entries, uploads, review requests, and result views by Blog and Gallery',
              'API audit logging now skips non-business endpoints and moves synchronous DB writes off the request event loop',
            ],
          },
        ],
      },
      {
        id: '2026-04-22-pro-conversion-and-faq-schema',
        date: '2026-04-22',
        title: 'Pro value repositioning and FAQPage duplicate fix',
        summary:
          'Pro is now framed as next-shoot guidance, complete review, and progress tracking instead of just deeper analysis. Locale home pages also no longer emit duplicate FAQPage structured data.',
        docPath: 'docs/changelog/update-log-2026-04-22-pro-conversion-and-faq-schema.md',
        sections: [
          {
            title: 'Pro value and conversion',
            items: [
              'Free / Pro boundaries now distinguish quick diagnosis from next-shoot guidance',
              'Review detail, history, and Usage promos read from one conversion strategy dictionary',
              'Usage now includes a decision panel that compares the before-and-after Pro experience',
            ],
          },
          {
            title: 'SEO structured data',
            items: [
              'Locale home pages suppress the nested HomePage FAQPage JSON-LD',
              '/zh, /en, and /ja keep a single FAQPage source from the locale layout',
            ],
          },
        ],
      },
      {
        id: '2026-04-20-review-growth-loop-and-replay-guidance',
        date: '2026-04-20',
        title: 'Growth loop, replay guidance, and next-shot checklists',
        summary:
          'History now surfaces a recent-vs-previous growth loop, review detail separates same-photo verification from new-photo retakes, and Flash suggestions are shaped into cleaner next-shot checklist actions.',
        docPath: 'docs/changelog/update-log-2026-04-20-review-growth-loop-and-replay-guidance.md',
        sections: [
          {
            title: 'Growth loop',
            items: [
              'History compares the most recent 3 critiques against the previous 3 and shows up / down / flat trend states',
              'Repeated weak dimensions under score 7 are surfaced first so the next practice target is obvious',
              'The latest three critiques link straight back to their detail pages',
            ],
          },
          {
            title: 'Next-shot guidance',
            items: [
              'Review detail now separates same-photo fix verification from retaking a new photo',
              'Up to 3 checklist items are extracted from suggestions with Action / Observation / Reason labels',
              'Workspace replay copy now makes it explicit that rerunning the same photo only makes sense after edits',
            ],
          },
          {
            title: 'Regression protection',
            items: [
              'Header auth-only navigation waits until hydration, avoiding signed-in shell flicker',
              'Added tests for prompt labels, replay copy, growth snapshots, and header visibility',
            ],
          },
        ],
      },
      {
        id: '2026-04-19-auth-hardening-and-request-stability',
        date: '2026-04-19',
        title: 'Auth hardening, safer task retries, and more stable requests',
        summary:
          'Tightened CORS and cookie behavior, corrected webhook error codes, added activation-code rate limiting, locked JWKS cache refreshes, and made frontend requests cancellable.',
        docPath: 'docs/changelog/update-log-2026-04-19-auth-hardening-and-request-stability.md',
        sections: [
          {
            title: 'Auth and API safety',
            items: [
              'CORS methods and headers are now explicit, including X-Device-Id used by the frontend',
              'Guest cookie SameSite handling is now environment-aware, and Clerk webhook 409/401/403 responses are separated correctly',
              'Activation-code redemption now has a per-user rate limit',
            ],
          },
          {
            title: 'Stability and regression protection',
            items: [
              'JWKS cache refreshes are locked to avoid concurrent upstream bursts',
              'Quota checks now happen before AI calls, and task-facing errors are sanitized for users',
              'AbortController support now cancels review, usage, replay, and task polling requests cleanly',
            ],
          },
        ],
      },
      {
        id: '2026-04-19-backend-frontend-module-split',
        date: '2026-04-19',
        title: 'Backend & frontend modular refactor',
        summary:
          'Split oversized backend routers and the review detail page into single-responsibility modules. No user-facing changes — this is a code organization update that improves maintainability.',
        docPath: 'docs/changelog/update-log-2026-04-19-backend-frontend-module-split.md',
        sections: [
          {
            title: 'Backend router split',
            items: [
              'Removed the 3000+ line routes.py monolith; all domain routers now live in api/routers/',
              'reviews.py (980 lines) split into four modules: create, actions, queries, support',
              'auth.py and gallery.py helper logic extracted into dedicated _support files',
            ],
          },
          {
            title: 'Frontend component split',
            items: [
              'Review detail page trimmed from ~390 to ~93 lines; logic moved to features/reviews/',
              '6 new UI components and 5 custom hooks created for the review page',
              'useUploadFlow utility functions extracted to uploadFlowSupport.ts',
            ],
          },
        ],
      },
      {
        id: '2026-04-13-blog-view-counts',
        date: '2026-04-13',
        title: 'Blog post view counts are now visible',
        summary:
          'Added public view counts for blog posts and wired article detail visits to increment the count automatically.',
        docPath: 'docs/changelog/update-log-2026-04-13-blog-view-counts.md',
        sections: [
          {
            title: 'Tracking',
            items: [
              'Added a dedicated blog_post_views table and public APIs keyed by article slug',
              'Opening a blog post detail page now records one new view automatically',
            ],
          },
          {
            title: 'UI',
            items: [
              'View counts now appear in the blog index, featured article block, related posts, and article detail header',
              'A 5-second session throttle prevents accidental rapid duplicate increments',
            ],
          },
        ],
      },
      {
        id: '2026-04-12-llms-seo-schema',
        date: '2026-04-12',
        title: 'llms.txt, Enhanced Schema.org, and Localized Updates Pages',
        summary:
          'Added llms.txt for AI search visibility, expanded Person and SoftwareSourceCode structured data, and launched locale-pinned /zh/updates, /en/updates, and /ja/updates routes.',
        docPath: 'docs/changelog/update-log-2026-04-12-llms-seo-schema.md',
        sections: [
          {
            title: 'AI Visibility (llms.txt)',
            items: [
              'Added /llms.txt and /.well-known/llms.txt with structured product summary, pricing, blog topics, and canonical URLs',
              'Extended siteConfig with author, social links, and repository URL for shared use across Schema and llms.txt',
            ],
          },
          {
            title: 'Schema.org Expansion',
            items: [
              'Added Person and SoftwareSourceCode JSON-LD to home, blog index, and blog post pages',
              'Blog and BlogPosting schemas now reference author by @id and include publisher, isPartOf, and inLanguage',
            ],
          },
          {
            title: 'Localized Updates Pages',
            items: [
              'Added /[locale]/updates routes with per-locale metadata and hreflang alternates',
              'Extracted UpdatesPageContent into a shared component that accepts a configurable homeHref',
            ],
          },
        ],
      },
      {
        id: '2026-04-11-blog-gallery-sort-theme',
        date: '2026-04-11',
        title: 'Blog Module, Gallery Sort, and Dark Theme Refinement',
        summary:
          'Launched a trilingual blog with 6 SEO articles, added gallery sorting (recommended, latest, top score, most likes), and recalibrated the dark theme to a warmer tone.',
        docPath: 'docs/changelog/update-log-2026-04-11-blog-gallery-sort-theme.md',
        sections: [
          {
            title: 'Blog Module',
            items: [
              'Added a /[locale]/blog route with 6 trilingual photography articles and full SSR metadata',
              'Wired blog links into Header, Footer, MarketingHeader, and home page',
              'Extended sitemap with per-locale blog index and per-post hreflang entries',
            ],
          },
          {
            title: 'Gallery Sort',
            items: [
              'Gallery now supports recommended, latest, top score, and most likes sort modes',
              'Backend sort parameter reuses the existing three-part cursor pagination',
            ],
          },
          {
            title: 'Theme and Style Unification',
            items: [
              'Shifted dark-mode palette to warmer tones and replaced hard-coded rgba values with CSS variables',
              'Photo proxy URLs now respect X-Forwarded-* headers for correct HTTPS generation behind reverse proxies',
            ],
          },
        ],
      },
      {
        id: '2026-04-10-locale-seo-and-gallery-refactor',
        date: '2026-04-10',
        title: 'Locale-Pinned Home Routes, SEO Signals, and Gallery UI Refactor',
        summary:
          'Added /zh, /en, and /ja locale-pinned home pages, wired hreflang and JSON-LD signals across public routes, and moved scattered home, gallery, review, and workspace copy into shared i18n keys while splitting the gallery UI into focused components.',
        docPath: 'docs/changelog/update-log-2026-04-10-locale-seo-and-gallery-refactor.md',
        sections: [
          {
            title: 'Locale Homes and SEO',
            items: [
              'Added direct /zh, /en, and /ja home routes that pin the active locale from the URL',
              'Gave each locale home its own metadata, keywords, Open Graph fields, and JSON-LD',
              'Expanded sitemap and public-page alternates so search engines can map the language variants correctly',
            ],
          },
          {
            title: 'Copy and UI Restructure',
            items: [
              'Moved home pricing, updates, and contact copy into the translation dictionaries and repointed the latest update hint to this release',
              'Unified workspace replay copy, review favorites labels, promo-card copy, and gallery SEO copy under shared zh/en/ja i18n keys',
              'Split the gallery page into dedicated filter, card, and pagination components without changing the public browsing flow',
            ],
          },
        ],
      },
      {
        id: '2026-04-09-gallery-ranking-and-quality-gates',
        date: '2026-04-09',
        title: 'Gallery Ranking, Image Rendering, and Lint Gates Updated',
        summary:
          'The public gallery now ranks work with score-weighted freshness, uses stable paging cursors for that combined order, restores reliable gallery card image rendering, and ships a real frontend lint baseline.',
        docPath: 'docs/changelog/update-log-2026-04-09-gallery-ranking-and-quality-gates.md',
        sections: [
          {
            title: 'Public Gallery Ranking',
            items: [
              'Changed gallery ordering from pure publish time to a combined score that favors higher-rated work while still rewarding recency',
              'Weighted score slightly above time so clearly stronger work stays ahead, while close scores let newer posts surface first',
              'Upgraded the gallery cursor format so paging stays stable under the new combined ordering',
            ],
          },
          {
            title: 'Rendering and Quality Gates',
            items: [
              'Allowed local backend image hosts in Next config so development thumbnails no longer fail host validation',
              'Moved gallery cards back to native `img` rendering after the `next/image` migration caused visible load regressions',
              'Added ESLint config and switched the lint script to the ESLint CLI so `npm run lint` is now a real non-interactive quality gate',
            ],
          },
        ],
      },
      {
        id: '2026-04-07-activation-code-billing',
        date: '2026-04-07',
        title: 'Activation Codes and China Purchase Flow Added',
        summary:
          'Added an Afdian plus activation-code path for Chinese Pro purchases, tightened expiry-aware billing sync, and exposed redeem entry points across the home, review, promo, and account surfaces.',
        docPath: 'docs/changelog/update-log-2026-04-07-activation-code-billing.md',
        sections: [
          {
            title: 'Activation-Code Billing',
            items: [
              'Added the activation-code table, redeem API, and 30-day Pro grant flow',
              'Redeeming on an already active manual Pro term now extends from the current expiry instead of overwriting it',
              'Auth-time and webhook-time plan sync now share the same access rules so expired paid plans fall back correctly',
            ],
          },
          {
            title: 'Chinese Purchase and Account UX',
            items: [
              'Chinese checkout buttons now open the Afdian purchase page and guide users back to redeem in-app',
              'The usage page now includes an activation-code explainer, redeem modal, and no-auto-renew messaging',
              'Activation-code subscriptions surface renewal entry points instead of the regular billing portal flow',
            ],
          },
          {
            title: 'Entry Points and Engineering',
            items: [
              'Added redeem CTAs to the home pricing block, shared Pro promo card, review detail, and usage page',
              'Added an activation-code generation script plus backend test coverage',
              'Moved review-page helper copy into its own module and switched production webpack caching to memory',
            ],
          },
        ],
      },
      {
        id: '2026-04-01-audit-score-gallery-polish',
        date: '2026-04-01',
        title: 'Moderation, Score Labels, and Gallery Cards Refined',
        summary:
          'Relaxed public-gallery moderation for clearly allowed borderline content, expanded review score labels to 10 localized tiers, and stabilized gallery cards for landscape images.',
        docPath: 'docs/changelog/update-log-2026-04-01-audit-score-gallery-polish.md',
        sections: [
          {
            title: 'Public Gallery Moderation',
            items: [
              'Updated the audit prompt so only clearly disallowed content is marked unsafe',
              'Treat swimwear, fashion shoots, non-explicit tight clothing, and artistic body expression as safe by default',
              'Bias uncertain cases toward safe to reduce over-blocking in the public gallery',
            ],
          },
          {
            title: 'Review Score Labels',
            items: [
              'Round final scores into 1 to 10 buckets and map them to dedicated labels',
              'Added full 10-tier score copy across Chinese, English, and Japanese',
            ],
          },
          {
            title: 'Gallery Cards',
            items: [
              'Unified gallery cards around an `object-contain` image treatment so landscape photos are not cropped away',
              'Added prompt regression coverage and ignored `.vercel` plus local env files in Git',
            ],
          },
        ],
      },
      {
        id: '2026-03-28-home-review-gallery-refresh',
        date: '2026-03-28',
        title: 'Home, Review, and Gallery Experience Refresh',
        summary:
          'Unified the home header with the app shell, added a sign-up entry, fixed review-detail display issues, and improved public gallery paging and thumbnail delivery.',
        docPath: 'docs/changelog/update-log-2026-03-28-home-review-gallery-refresh.md',
        sections: [
          {
            title: 'Home Experience',
            items: [
              'Aligned the home header with the standard in-app header',
              'Added a sign-up action beside sign-in and fixed avatar / Pro card tip clipping',
              'Kept FAQ, auth entry points, and background effects lazily mounted to protect first load',
            ],
          },
          {
            title: 'Review Detail',
            items: [
              'Stopped a single improvement suggestion from being split into multiple cards by punctuation',
              'Prefer locally cached upload previews on the review page to reduce missing-image cases',
            ],
          },
          {
            title: 'Public Gallery',
            items: [
              'Added first / last / page-number pagination controls with visible range feedback',
              'Generated dedicated gallery thumbnails with long-lived caching and added a backfill script',
            ],
          },
        ],
      },
      {
        id: '2026-03-27-gallery-navigation-and-filters',
        date: '2026-03-27',
        title: 'Public Gallery Navigation and Filters Updated',
        summary:
          'The public gallery now supports history-style filters, URL-synced state, reliable return-position restoration, and thumbnail-only card loading.',
        docPath: 'docs/changelog/update-log-2026-03-27-gallery-navigation-and-filters.md',
        sections: [
          {
            title: 'Gallery Filters',
            items: [
              'Added date range, min score, max score, and image-type filters to the public gallery',
              'Matched the filter interaction model used in review history',
              'Updated the backend `/gallery` route so both result rows and `total_count` follow the active filters',
            ],
          },
          {
            title: 'Back Navigation Recovery',
            items: [
              'Saved page, loaded items, and scroll position before opening a gallery detail page',
              'Restored gallery state for both in-page back buttons and browser back/forward navigation',
              'Scoped restore data by the active filter set so different gallery result sets do not overwrite each other',
            ],
          },
          {
            title: 'Thumbnail Loading',
            items: [
              'Gallery cards now render only from `photo_thumbnail_url`',
              'Removed the original-image-first loading path from the gallery list',
              'Kept gallery cards visually sharp while reducing unnecessary image transfer',
            ],
          },
        ],
      },
      {
        id: '2026-03-25-pro-launch-checkout',
        date: '2026-03-25',
        title: 'Pro Launch Offer and Direct Checkout Updated',
        summary:
          'Standardized the launch-offer messaging, expanded Pro entry points, and sent purchase buttons straight to checkout.',
        docPath: 'docs/changelog/update-log-2026-03-25-pro-launch-checkout.md',
      },
      {
        id: '2026-03-24-score-upgrade',
        date: '2026-03-24',
        title: 'Scoring Upgrade and Gallery Recommendation Logic',
        summary:
          'Unified scoring behavior across modes and added score-version-aware recommendation logic to the public gallery.',
        docPath: 'docs/changelog/update-log-2026-03-24-score-upgrade.md',
      },
      {
        id: '2026-03-22-gallery-likes',
        date: '2026-03-22',
        title: 'Public Gallery Likes and SEO Improvements',
        summary:
          'Added persistent gallery likes for signed-in users and tightened SEO metadata for public-facing pages.',
        docPath: 'docs/changelog/update-log-2026-03-22-gallery-likes.md',
      },
      {
        id: '2026-03-21-strict-scoring',
        date: '2026-03-21',
        title: 'Stricter Scoring Prompt and Correct Gallery Count',
        summary:
          'Tightened the AI scoring prompt and fixed the gallery header so the total count is correct from page one.',
        docPath: 'docs/changelog/update-log-2026-03-21-strict-scoring.md',
      },
      {
        id: '2026-03-20-gallery',
        date: '2026-03-20',
        title: 'Public Gallery Browsing, Moderation, and Paging',
        summary:
          'Rolled out the public gallery workflow with moderation, guest browsing, gallery cards, and stable paging behavior.',
        docPath: 'docs/changelog/update-log-2026-03-20-gallery.md',
      },
      {
        id: '2026-03-20-history-and-favorites',
        date: '2026-03-20',
        title: 'History, Sharing, Replay, and Favorites Connected',
        summary:
          'Connected history filtering, sharing, export, replay analysis, and favorites across the frontend and backend.',
        docPath: 'docs/changelog/update-log-2026-03-20.md',
      },
    ];
  }

  return [
    {
      id: '2026-04-24-stage-d-content-conversion',
      date: '2026-04-24',
      title: '内容来源转化与工作台入口打通',
      summary:
        'Blog、Gallery 和首页新增按意图回到评图工作台的入口，并补齐内容浏览、点击、上传到首评完成的周报统计口径。',
      docPath: 'docs/changelog/update-log-2026-04-24-stage-d-content-conversion.md',
      sections: [
        {
          title: '工作台入口',
          items: [
            'Blog 文章底部 CTA 会按文章题材生成同类点评和上传入口，并携带来源、入口、文章 slug 和图片类型',
            'Gallery 卡片新增同题材练习入口，以及用同一套标准点评自己照片的入口',
            '首页新增新用户、回访用户、内容读者三类开始路径',
          ],
        },
        {
          title: '转化统计',
          items: [
            '`content_workspace_clicked` 记录 Blog / Gallery 用户进入工作台前的点击意图',
            '周报按 Blog 和 Gallery 拆分浏览、点击、工作台进入、上传、发起点评和查看结果',
            'API 审计日志跳过非业务端点，并把同步数据库写入移出请求事件循环',
          ],
        },
      ],
    },
    {
      id: '2026-04-22-pro-conversion-and-faq-schema',
      date: '2026-04-22',
      title: 'Pro 价值表达重做与 FAQPage 重复修复',
      summary:
        'Pro 不再只表达为“更深度点评”，而是围绕下一次拍摄指导、完整复盘和进步追踪展开；同时修复 /zh、/en、/ja 首页 FAQPage 结构化数据重复问题。',
      docPath: 'docs/changelog/update-log-2026-04-22-pro-conversion-and-faq-schema.md',
      sections: [
        {
          title: 'Pro 价值与转化',
          items: [
            'Free / Pro 边界改为“快速诊断”和“下一次拍摄指导”的差异',
            '结果页、历史页和 Usage 页的 Pro 触发位统一读取转化策略字典',
            'Usage 页面新增付费前后体验差异面板，帮助用户判断是否升级',
          ],
        },
        {
          title: 'SEO 结构化数据',
          items: [
            'locale 首页复用 HomePage 时不再重复输出 FAQPage JSON-LD',
            '/zh、/en、/ja 首页保留 locale layout 里的唯一 FAQPage 来源',
          ],
        },
      ],
    },
    {
      id: '2026-04-20-review-growth-loop-and-replay-guidance',
      date: '2026-04-20',
      title: '连续进步视图、复评重拍分流与下一轮清单',
      summary:
        '历史页新增最近 3 次成长视图，评图详情把“同图复评”和“换图重拍”拆成两条更明确的路径，Flash 建议也收紧成可直接执行的下一轮拍摄清单。',
      docPath: 'docs/changelog/update-log-2026-04-20-review-growth-loop-and-replay-guidance.md',
      sections: [
        {
          title: '连续进步与弱项',
          items: [
            '历史页会对比最近 3 次和之前 3 次平均分，并显示上升、下降或持平趋势',
            '系统会优先标出反复低于 7 分的维度，帮助先盯住最拖后腿的问题',
            '最近 3 次点评都可以直接点回详情页继续看',
          ],
        },
        {
          title: '复评与重拍路径',
          items: [
            '评图详情新增“同图验证修正”和“换新照片重拍”双路径卡片',
            '系统会从建议里抽出最多 3 条下一轮清单，并显示动作、观察和原因',
            '工作台复评横幅也明确提示：只有已经改过这张图时，同图复评才真正有意义',
          ],
        },
        {
          title: '回归保护',
          items: [
            'Header 登录态导航改成 hydration 后再显示，避免首屏先闪出错误的已登录壳',
            '补上 prompt、文案、成长快照和 header 可见性测试',
          ],
        },
      ],
    },
    {
      id: '2026-04-19-auth-hardening-and-request-stability',
      date: '2026-04-19',
      title: '认证加固、任务重试收口与请求稳定性修复',
      summary:
        '这次更新集中修复了认证链路与跨域边界，补上激活码限速、JWKS 缓存加锁、任务错误脱敏，并让前端请求在切页和轮询场景下可被正确取消。',
      docPath: 'docs/changelog/update-log-2026-04-19-auth-hardening-and-request-stability.md',
      sections: [
        {
          title: '认证与接口保护',
          items: [
            'CORS 方法和请求头改为显式白名单，并补回前端真实使用的 X-Device-Id',
            'guest cookie 的 SameSite 按环境处理，Clerk webhook 的 409/401/403 响应码不再混用',
            '激活码兑换接口新增按用户限速，降低高频猜码风险',
          ],
        },
        {
          title: '稳定性与回归保护',
          items: [
            'JWKS 缓存刷新加锁，避免并发击穿上游',
            '配额检查前移到 AI 调用前，异步任务错误对外统一脱敏',
            '前端详情、用量、复用分析和任务轮询请求已接入 AbortController 取消链路',
          ],
        },
      ],
    },
    {
      id: '2026-04-19-backend-frontend-module-split',
      date: '2026-04-19',
      title: '后端与前端模块化重构',
      summary:
        '将过大的后端路由文件和前端评图详情页拆分为职责单一的子模块，提升代码可读性与可维护性。本次无用户可见功能变化。',
      docPath: 'docs/changelog/update-log-2026-04-19-backend-frontend-module-split.md',
      sections: [
        {
          title: '后端路由拆分',
          items: [
            '删除 3000 余行的 routes.py 单体文件，各域路由完整迁移至 api/routers/',
            'reviews.py（980 行）拆分为创建、操作、查询、通用支持 4 个子模块',
            'auth.py 和 gallery.py 辅助逻辑分别提取至 _support 文件',
          ],
        },
        {
          title: '前端组件拆分',
          items: [
            '评图详情页从 ~390 行精简至 ~93 行，逻辑迁入 features/reviews/',
            '新增 6 个 UI 组件与 5 个自定义 Hook',
            'useUploadFlow 工具函数提取至 uploadFlowSupport.ts',
          ],
        },
      ],
    },
    {
      id: '2026-04-13-blog-view-counts',
      date: '2026-04-13',
      title: '博客文章现已显示浏览次数',
      summary:
        '为每篇博客文章增加了公开浏览次数展示，并在用户进入文章详情页时自动累加一次浏览记录。',
      docPath: 'docs/changelog/update-log-2026-04-13-blog-view-counts.md',
      sections: [
        {
          title: '浏览统计',
          items: [
            '新增按文章 slug 记录浏览量的 blog_post_views 数据表和公开接口',
            '打开博客详情页时会自动为当前文章增加一次浏览数',
          ],
        },
        {
          title: '前端展示',
          items: [
            '博客列表、精选文章、相关文章和文章详情页头部都开始显示浏览次数',
            '同一会话内增加 5 秒节流，避免极短时间重复进入造成连续累加',
          ],
        },
      ],
    },
    {
      id: '2026-04-12-llms-seo-schema',
      date: '2026-04-12',
      title: 'llms.txt 上线、Schema.org 扩展与多语言更新记录页',
      summary:
        '新增 llms.txt 提升AI搜索可见性，补齐 Person 和 SoftwareSourceCode 结构化数据，并上线 /zh/updates、/en/updates、/ja/updates 多语言路由。',
      docPath: 'docs/changelog/update-log-2026-04-12-llms-seo-schema.md',
      sections: [
        {
          title: 'AI 可见性（llms.txt）',
          items: [
            '新增 /llms.txt 和 /.well-known/llms.txt，结构化展示产品定位、定价、博客主题与关键 URL',
            'siteConfig 新增 author、social、repositoryUrl 配置，供 Schema 和 llms.txt 共用',
          ],
        },
        {
          title: 'Schema.org 扩展',
          items: [
            '首页、博客索引、文章页新增 Person（作者）与 SoftwareSourceCode 结构化数据',
            'Blog 与 BlogPosting 增加 author（@id 引用）、publisher、isPartOf、inLanguage 字段',
          ],
        },
        {
          title: '多语言更新记录页',
          items: [
            '新增 /[locale]/updates 路由，提供中英日三语独立的更新记录页面',
            '提取 UpdatesPageContent 为共享组件，通过 homeHref 参数控制返回路径',
          ],
        },
      ],
    },
    {
      id: '2026-04-11-blog-gallery-sort-theme',
      date: '2026-04-11',
      title: '博客模块、画廊排序与深色主题优化',
      summary:
        '上线三语博客（6 篇 SEO 文章），画廊新增推荐/最新/最高分/最多赞排序，深色模式切换到更温暖的色调。',
      docPath: 'docs/changelog/update-log-2026-04-11-blog-gallery-sort-theme.md',
      sections: [
        {
          title: '博客模块',
          items: [
            '新增 /[locale]/blog 路由，包含 6 篇中英日摄影学习文章，带完整 SSR Metadata',
            '导航栏、页脚和首页均新增博客入口链接',
            'sitemap 扩展覆盖博客索引和每篇文章的多语 hreflang',
          ],
        },
        {
          title: '画廊排序',
          items: [
            '画廊新增推荐/最新/最高分/最多赞 4 种排序，后端复用已有游标分页机制',
            '筛选面板新增排序按钮组，当前选中项金色高亮',
          ],
        },
        {
          title: '主题与样式统一',
          items: [
            '深色模式 9 个基础色值改为暖褐色调，多处硬编码色值统一使用 CSS 变量',
            '后端代理 URL 适配反向代理 X-Forwarded-* 头，非 localhost 自动升级 HTTPS',
          ],
        },
      ],
    },
    {
      id: '2026-04-10-locale-seo-and-gallery-refactor',
      date: '2026-04-10',
      title: '多语言首页直达、SEO 路由与长廊页面重构',
      summary:
        '新增 /zh、/en、/ja 语言固定首页，补齐 hreflang、JSON-LD 与 sitemap 多语入口；同时把首页、长廊、评图页和工作台的零散文案收拢进 i18n，并把公开长廊页面拆成独立组件，便于继续迭代。',
      docPath: 'docs/changelog/update-log-2026-04-10-locale-seo-and-gallery-refactor.md',
      sections: [
        {
          title: '多语言首页与 SEO',
          items: [
            '新增 /zh、/en、/ja 直达首页，打开后会固定当前语言并写回本地偏好',
            '各语种首页补齐独立 metadata、关键词、JSON-LD 与 canonical / alternate languages',
            'sitemap 与 affiliate、gallery、updates、公开示例页也同步带上多语 alternate 信息，便于搜索引擎识别语言版本',
          ],
        },
        {
          title: '前端文案与页面结构整理',
          items: [
            '首页价格、更新记录、联系方式等文案改由翻译字典驱动，首页底部最新更新提示同步改指向本次更新主题',
            '工作台“复用上一张照片”、评图页 favorites 返回文案、Pro 转化卡和长廊 SEO 文案统一收拢到 zh/en/ja i18n',
            '公开长廊的筛选、卡片、分页拆成独立组件，保留现有交互的同时降低后续改动成本',
          ],
        },
      ],
    },
    {
      id: '2026-04-09-gallery-ranking-and-quality-gates',
      date: '2026-04-09',
      title: '公开长廊排序、图片渲染与前端质量门更新',
      summary:
        '公开影像长廊已切换为分数权重略高于时间的新排序逻辑，并配套升级了稳定分页游标；同时修复了长廊图片显示问题，补齐了可持续运行的前端 lint 基线。',
      docPath: 'docs/changelog/update-log-2026-04-09-gallery-ranking-and-quality-gates.md',
      sections: [
        {
          title: '公开长廊排序',
          items: [
            '长廊不再只按发布时间倒序，而是按“分数优先、时间次优先”的组合热度排序',
            '当作品分数接近时，更新发布的作品会获得更高的新鲜度加成，更容易排在前面',
            '分页游标同步升级为组合分、发布时间和记录 ID 的稳定游标，避免翻页重复或漏项',
          ],
        },
        {
          title: '图片显示与质量门',
          items: [
            'Next 配置补齐本地后端图片源，解决开发环境里 `next/image` 主机未配置报错',
            '长廊卡片图片恢复为更稳定的原生 `img` 渲染路径，修复缩略图能请求但不显示的问题',
            '前端补齐 ESLint 配置并切换到 CLI lint 脚本，`npm run lint` 现在可以稳定执行',
          ],
        },
      ],
    },
    {
      id: '2026-04-07-activation-code-billing',
      date: '2026-04-07',
      title: '激活码开通、国内支付入口与 Pro 同步补齐',
      summary:
        '为中文用户补上爱发电购买加激活码开通链路，后台同步完善订阅到期回落逻辑，并把兑换入口接到首页、评图页、营销卡片和账户页。',
      docPath: 'docs/changelog/update-log-2026-04-07-activation-code-billing.md',
      sections: [
        {
          title: '激活码订阅链路',
          items: [
            '新增激活码表、兑换接口和 30 天 Pro 开通逻辑',
            '已有激活码 Pro 未到期时，新兑换会从当前到期时间继续顺延',
            '鉴权请求与 webhook 现在共用同一套订阅判断，过期会员会正确降回 free 或 guest',
          ],
        },
        {
          title: '中文购买与账户页',
          items: [
            '中文环境购买按钮改为前往爱发电，下单后回站内输入激活码开通',
            '额度页新增激活码说明区、兑换弹窗和无自动续费提示',
            '激活码来源的 Pro 不再显示订阅管理，而是展示续费入口和到期时间',
          ],
        },
        {
          title: '入口与工程补充',
          items: [
            '首页定价区、Pro 转化卡、评图详情和额度页都补上“输入激活码”入口',
            '新增激活码生成脚本和后端测试覆盖',
            '评图详情辅助逻辑抽到独立模块，生产构建切换为内存缓存',
          ],
        },
      ],
    },
    {
      id: '2026-04-01-audit-score-gallery-polish',
      date: '2026-04-01',
      title: '公开长廊审核、评分文案与卡片展示同步细化',
      summary:
        '放宽公开长廊对边界安全内容的误杀，补齐评图结果 10 档本地化标签，并让长廊横图在卡片里稳定完整展示。',
      docPath: 'docs/changelog/update-log-2026-04-01-audit-score-gallery-polish.md',
      sections: [
        {
          title: '公开长廊审核',
          items: [
            '审核 prompt 改为只拦截明确违规内容，减少误判',
            '泳装、时尚摄影、非露点贴身服装和艺术化人体表达默认倾向 safe',
            '判断不明确时优先放行，降低公开长廊误杀',
          ],
        },
        {
          title: '评图结果文案',
          items: [
            '最终得分按 1 到 10 的整数档位映射到专属标签',
            '中文、英文、日文都补齐了 10 档评分总结语',
          ],
        },
        {
          title: '长廊卡片展示',
          items: [
            '长廊卡片统一改为 `object-contain`，横图不再被直接裁切',
            '同时补上审核 prompt 测试，并忽略 `.vercel` 与本地环境文件',
          ],
        },
      ],
    },
    {
      id: '2026-03-28-home-review-gallery-refresh',
      date: '2026-03-28',
      title: '首页、评图与长廊体验一轮整理',
      summary:
        '统一首页顶栏样式，补上注册入口并修复头像与 Pro 卡片展示细节，同时完善评图详情展示和公开长廊分页、缩略图链路。',
      docPath: 'docs/changelog/update-log-2026-03-28-home-review-gallery-refresh.md',
      sections: [
        {
          title: '首页体验',
          items: [
            '首页顶栏已与应用内标准 Header 统一',
            '新增注册入口，并修复头像显示与 Pro 卡片底部 tips 截断',
            'FAQ、认证入口和背景特效继续保持延迟挂载，控制首页负载',
          ],
        },
        {
          title: '评图详情',
          items: [
            '修复单条改进建议被分号拆成多张卡片的问题',
            '评图详情优先读取本地上传预览，减少图片丢失或加载失败',
          ],
        },
        {
          title: '公开长廊',
          items: [
            '新增首页、末页和页码跳转的分页控件，并展示当前区间',
            '补齐公开长廊缩略图生成、长期缓存和回填脚本链路',
          ],
        },
      ],
    },
    {
      id: '2026-03-27-gallery-navigation-and-filters',
      date: '2026-03-27',
      title: '公开影像长廊的返回恢复与筛选已补齐',
      summary:
        '公开长廊现在支持和历史页一致的筛选条件，筛选状态会进入 URL，从详情返回时也能恢复原来的分页和滚动位置。',
      docPath: 'docs/changelog/update-log-2026-03-27-gallery-navigation-and-filters.md',
      sections: [
        {
          title: '长廊筛选',
          items: [
            '公开长廊新增开始时间、结束时间、最低评分、最高评分、图片类型筛选',
            '筛选交互与“我的历史”统一，降低切换成本',
            '后端 `/gallery` 会按当前筛选返回列表和总数',
          ],
        },
        {
          title: '返回恢复',
          items: [
            '从长廊点进详情前，会保存当前筛选结果下的分页、滚动位置和点击卡片',
            '返回按钮与浏览器前进/后退键都会恢复原来的长廊状态',
            '恢复状态按筛选条件分开保存，不会互相串位',
          ],
        },
        {
          title: '图片加载',
          items: [
            '长廊卡片改为只使用 `photo_thumbnail_url`',
            '不再为了列表卡片优先请求原图',
            '在保持清晰度的前提下减少不必要的图片带宽消耗',
          ],
        },
      ],
    },
    {
      id: '2026-03-25-pro-launch-checkout',
      date: '2026-03-25',
      title: 'Pro 首发优惠与直达购买链路上线',
      summary:
        '统一了 Pro 的首发优惠表达，补强多个页面入口，并把购买按钮改成直达 checkout。',
      docPath: 'docs/changelog/update-log-2026-03-25-pro-launch-checkout.md',
    },
    {
      id: '2026-03-24-score-upgrade',
      date: '2026-03-24',
      title: '评分口径升级与长廊推荐逻辑更新',
      summary:
        '统一 flash 与 pro 的评分口径，并为公开长廊加入 score version 和推荐标记逻辑。',
      docPath: 'docs/changelog/update-log-2026-03-24-score-upgrade.md',
    },
    {
      id: '2026-03-22-gallery-likes',
      date: '2026-03-22',
      title: '公开长廊点赞与 SEO 优化上线',
      summary:
        '公开长廊新增持久化点赞，同时补齐公开页面的 SEO metadata、robots 与 sitemap 策略。',
      docPath: 'docs/changelog/update-log-2026-03-22-gallery-likes.md',
    },
    {
      id: '2026-03-21-strict-scoring',
      date: '2026-03-21',
      title: '更严格的评分 prompt 与长廊总数修复',
      summary:
        '收紧了 AI 评图评分标准，并修复影像长廊头部“已收录”数字在第一页显示不正确的问题。',
      docPath: 'docs/changelog/update-log-2026-03-21-strict-scoring.md',
    },
    {
      id: '2026-03-20-gallery',
      date: '2026-03-20',
      title: '公开影像长廊浏览、审核与分页体验打通',
      summary:
        '补齐了公开长廊的浏览、审核、游客只读、卡片展示和分页体验。',
      docPath: 'docs/changelog/update-log-2026-03-20-gallery.md',
    },
    {
      id: '2026-03-20-history-and-favorites',
      date: '2026-03-20',
      title: '历史记录、分享、再分析与收藏能力接通',
      summary:
        '把历史筛选、分享导出、再次分析和收藏能力从后端真正接到了前端。',
      docPath: 'docs/changelog/update-log-2026-03-20.md',
    },
  ];
}

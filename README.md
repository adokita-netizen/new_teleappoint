# テレアポ外注管理システム

外注テレアポの運用を効率化するWebアプリケーション。リードのCSVインポート・配布、Agentによる架電結果の素早い入力、Googleカレンダー連携によるアポ作成・更新、KPIダッシュボード表示を実装。

## 主要機能

### 1. ダッシュボード(使用者向け)
- 今日のKPI表示(架電数、接続率、アポイント率、アポイント数)
- 期間フィルタ(今日/今週/今月)
- 今日のタスク表示
- 操作ガイド付き

### 2. 管理者ダッシュボード
- 全体統括KPI表示
- 担当者別フィルタ
- 期間別フィルタ
- ステータス別分布表示
- エージェント別パフォーマンス表示
- クイックアクション

### 3. 効果測定
- 前期比較機能
- トレンド表示(上昇/下降/横ばい)
- KPI指標の推移分析
- エージェント別パフォーマンス
- インサイト自動生成

### 4. 架電画面(Agent用)
- 「次のリード」ボタンで1クリックで架電先を取得
- 顧客情報の表示(会社名、氏名、電話番号、メールアドレス、都道府県、業種、メモ)
- 1クリックで結果登録(接続/不在/折り返し依頼/再アタック待ち/NG/要検討/アポイント化/失注)
- メモ入力機能
- 保存後、自動で次のリードへ遷移
- 操作ガイド付き

### 5. リスト管理
- リスト一覧表示
- リスト詳細(リスト名、説明、件数、作成日)
- **CSVエクスポート機能**(日本語ヘッダー付き)
- **サンプルCSVダウンロード**

### 6. CSVインポート
- CSVファイルからリードを一括インポート
- 重複検知機能(電話番号/メールアドレス/会社名+氏名)
- 列マッピング(name, company, phone, email, prefecture, industry, memo)
- **サンプルCSVダウンロードボタン**
- CSV形式ガイド表示

### 7. アポイント管理
- アポイント一覧表示
- ステータス管理(予定/確定/キャンセル/完了)
- 日時表示

### 8. ユーザー管理(Admin専用)
- ユーザー一覧表示
- ロール変更機能(Admin/Manager/Agent/Viewer)

### 9. 設定
- システム設定(今後実装予定)
- Google連携(今後実装予定)

## ロール別アクセス権限

| 機能 | Admin | Manager | Agent | Viewer |
|------|-------|---------|-------|--------|
| ダッシュボード | ✓ | ✓ | ✓ | ✓ |
| 管理者ダッシュボード | ✓ | ✓ | - | - |
| 効果測定 | ✓ | ✓ | - | - |
| 架電 | ✓ | ✓ | ✓ | - |
| リスト管理 | ✓ | ✓ | - | - |
| アポイント | ✓ | ✓ | ✓ | ✓ |
| インポート | ✓ | ✓ | - | - |
| ユーザー管理 | ✓ | - | - | - |
| 設定 | ✓ | ✓ | - | - |

## 技術スタック

- **フロントエンド**: React 19 + TypeScript + Tailwind CSS 4
- **バックエンド**: Express 4 + tRPC 11
- **データベース**: MySQL/TiDB (Drizzle ORM)
- **認証**: Manus OAuth
- **開発環境**: Vite + tsx

## データベーススキーマ

### users
- id, openId, name, email, loginMethod, role, createdAt, updatedAt, lastSignedIn

### leads
- id, name, company, phone, email, prefecture, industry, memo, status, ownerId, nextActionAt, listId, campaignId, createdAt, updatedAt

### call_logs
- id, leadId, agentId, result, memo, nextActionAt, createdAt

### appointments
- id, leadId, ownerUserId, status, startAt, endAt, title, description, googleCalendarId, googleEventId, createdAt, updatedAt

### lists
- id, name, description, totalCount, createdBy, createdAt, updatedAt

### campaigns
- id, name, description, createdBy, createdAt, updatedAt

### assignments
- id, leadId, agentId, assignedBy, assignedAt

## 開発

```bash
# 依存関係のインストール
pnpm install

# データベースマイグレーション
pnpm db:push

# 開発サーバーの起動
pnpm dev
```

## テスト

```bash
# データベーステストの実行
npx tsx test-db.ts
```

## CSVインポート形式

必須項目:
- name (氏名)
- phone (電話番号)

任意項目:
- company (会社名)
- email (メールアドレス)
- prefecture (都道府県)
- industry (業種)
- memo (メモ)

サンプルCSV:
```csv
name,company,phone,email,prefecture,industry,memo
山田太郎,株式会社サンプル,03-1234-5678,yamada@sample.co.jp,東京都,IT,テストデータ1
佐藤花子,テスト商事,06-9876-5432,sato@test.co.jp,大阪府,製造業,テストデータ2
```

**サンプルCSVのダウンロード**: インポートページまたはリスト管理ページから「サンプルCSV」ボタンをクリック

## CSVエクスポート

リスト管理ページから「エクスポート」ボタンをクリックすると、現在のリード一覧をCSV形式でダウンロードできます。

エクスポートされるデータ:
- 会社名、氏名、電話番号、メールアドレス、都道府県、業種、メモ、ステータス、最終更新日時

## 新機能(v2.0)

### 管理者画面と使用者画面の分離
- **管理者画面**: 全体統括、効果測定、ユーザー管理
- **使用者画面**: 架電業務に特化したシンプルなUI

### CSVダウンロード機能
- サンプルCSVのダウンロード
- リード一覧のCSVエクスポート(日本語ヘッダー付き)

### 効果測定機能の強化
- 前期比較機能
- トレンド表示(上昇/下降/横ばい)
- インサイト自動生成

### UI/UXの改善
- 各ページにヘルプテキスト追加
- 操作ガイドの表示
- より直感的なナビゲーション

## 今後の拡張予定

- Googleカレンダー連携(OAuth2認証、イベント作成/更新/削除、Free/Busy確認)
- リード配布機能(担当者への一括配布、均等/比率配布)
- キャンペーン管理機能
- スクリプト(トーク)テンプレート管理
- KPI自動スナップショット
- 外部表計算との双方向同期(Googleスプレッドシート)
- エージェント別詳細パフォーマンス分析
- グラフ表示(折れ線グラフ、棒グラフ)

## ライセンス

MIT


# blog-cms

[astro-blog](https://github.com/keisuke-yamauch1/astro-blog) の入稿を担う **Git-based ヘッドレスCMS**（microCMS依存脱却の「案C」）。

管理画面で記事を書くと、GitHub Contents API 経由で astro-blog リポジトリに frontmatter 付き Markdown を commit する。astro-blog はそれをビルド時に直読み（Content Collections）して配信する。

```
[blog-cms]  入稿UI + 認証 + 保存ロジック
    │ GitHub Contents API で .md を commit
    ▼
[astro-blog]  src/content/*.md → getCollection → Vercel 自動再デプロイ
```

## 技術スタック

- Astro 5（SSR）+ Cloudflare（Pages/Workers）
- Preact（フォームUI）
- zod（スキーマ＝単一の真実）
- octokit + gray-matter（Markdown 読み書き）
- 認証: Cloudflare Access ＋ 関所（[sekisho](https://github.com/kechiiiiin/sekisho)・JWT 検証の認証 Worker を Service Binding の RPC で呼ぶ）

## アーキテクチャの肝: StorageAdapter

`src/adapters/types.ts` の `StorageAdapter` インターフェースに UI・API が依存する。
今は `github-adapter.ts`（Markdown を commit）。**将来 D1 ベースの自作CMS（案B）に移るときは `d1-adapter.ts` を1枚足して `src/lib/server.ts` のファクトリを差し替えるだけ**。UI・認証・スキーマは無改修。

```
src/
├─ adapters/
│  ├─ types.ts          # StorageAdapter インターフェース ★
│  └─ github-adapter.ts # 案C実装（Markdown を commit）
├─ lib/
│  ├─ content-types.ts  # コンテンツタイプ定義（保存先・表示名）
│  ├─ schema.ts         # zod スキーマ（単一の真実）
│  └─ server.ts         # locals.runtime.env → adapter ファクトリ
├─ lib/auth/sekisho.ts # 関所（sekisho）の RPC 呼び出し（3秒打ち切り・fail-closed）
├─ middleware.ts        # Cloudflare Access 認証（関所に聞く）
├─ components/PostForm.tsx
├─ layouts/Layout.astro
└─ pages/
   ├─ index.astro       # 記事一覧
   ├─ new/[type].astro  # 新規作成
   ├─ edit/[type]/[id].astro
   └─ api/{save,delete}.ts
```

## セットアップ

```bash
npm install
cp .dev.vars.example .dev.vars   # 値を埋める（GITHUB_TOKEN など）
npm run dev                      # http://localhost:4321
```

`.dev.vars` の `DEV_BYPASS_AUTH="true"` でローカルは認証バイパス。

## 環境変数

| 変数 | 内容 |
|---|---|
| `GITHUB_TOKEN` | astro-blog への書き込み権限を持つ PAT（contents: write） |
| `GITHUB_OWNER` | `keisuke-yamauch1` |
| `GITHUB_REPO` | `astro-blog` |
| `CF_ACCESS_AUD` | この Access アプリケーションの AUD タグ（関所に渡す） |
| `DEV_BYPASS_AUTH` | ローカル（`.dev.vars`）のみ `true`。本番では設定しない |

バインディング（wrangler.toml が正・デプロイで反映）: `IMAGES`（R2）・`CMS_CACHE`（KV）・`SEKISHO`（関所への Service Binding）。

## 認証

Cloudflare Access がアプリ全体（カスタムドメインと `*.pages.dev`）を守り、リクエストに `Cf-Access-Jwt-Assertion` を付ける。
`src/middleware.ts` はこれを関所（sekisho）に Service Binding の RPC `verify(token, CF_ACCESS_AUD)` で確かめてもらう。
署名（RS256・JWKS）・iss・aud・exp・許可メールは関所の側で見る。チームドメインと許可メール（`ALLOWED_EMAILS`）も関所が持つ。

- 関所が `{ kind: 'user', email }` を返したときだけ通し、`locals.user = { email }`（小文字）
- トークン無し・不正・期限切れ・許可メール外・binding 未設定・`CF_ACCESS_AUD` 空・関所の例外・3秒の時間切れ・想定外の戻り値 → **401**（fail-closed）
- サービストークン（`kind: 'service'`）→ **403**（`allowServiceTokens` は渡さない）
- ローカルは `DEV_BYPASS_AUTH="true"` かつ localhost のときだけバイパス

関所は呼び出し側より先にデプロイされている必要がある（binding の相手が無いと全員 401）。

## デプロイ（Cloudflare Pages）

1. Pages プロジェクトを作成し本リポジトリを接続（ビルド: `npm run build`、出力: `dist`）
2. 環境変数・Secrets を設定（上表）。R2/KV/Service バインディングは wrangler.toml で管理（デプロイで自動反映）
3. Cloudflare Access でアプリ全体を保護（カスタムドメインと `*.pages.dev` の両方を宛先に）

## 実装済みの主な機能

- Toast UI Editor による WYSIWYG/Markdown 執筆（空行保持・`---` 区切り線対応）
- R2 画像アップロード（`/api/upload`・エディタ D&D / 写真ボタン・クライアント圧縮）
- Access JWT の検証を関所（sekisho）に委ねる（Service Binding RPC・3秒打ち切り・fail-closed）
- KV による一覧キャッシュ（`CMS_CACHE`・真実は GitHub・再同期ボタンあり）
- format:html 記事（microCMS 移行分）は textarea で生 HTML のまま編集

astro-blog 側の microCMS → Content Collections 切替は完了済み（2026-07・全237件移行）。

## TODO / 今後

- [ ] 下書きプレビュー（`/api/preview` でサーバレンダリング）

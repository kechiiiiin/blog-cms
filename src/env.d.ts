/// <reference path="../.astro/types.d.ts" />

// Cloudflare ランタイムに渡る環境変数（Secrets含む）
interface Env {
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  DEV_BYPASS_AUTH?: string;
  // Cloudflare Access の JWT は関所（sekisho）に Service Binding の RPC で検証してもらう（wrangler.toml の [[services]]）
  SEKISHO?: import('./lib/auth/sekisho').Sekisho;
  CF_ACCESS_AUD?: string; // この Access アプリの Application Audience (AUD) tag。関所に渡す
  // R2 バケット（画像アップロード先・images.kechiiiiin.com）
  IMAGES?: R2Bucket;
  // KV: 一覧メタのキャッシュ（真実は GitHub。壊れたらキー削除で再構築される）
  CMS_CACHE?: KVNamespace;
}

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {
    // middleware が詰める認証済みユーザー
    user?: { email: string };
  }
}

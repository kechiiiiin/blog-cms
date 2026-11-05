import { defineMiddleware } from 'astro:middleware';
import { verifyAccess } from './lib/auth/sekisho';

// Cloudflare Access がリクエストに付ける Cf-Access-Jwt-Assertion を、
// 関所（sekisho・Access の JWT を検証する認証 Worker）に Service Binding（SEKISHO）の RPC で確かめてもらう。
// 署名・iss・aud・exp・許可メールの判定は関所の側（呼び出しは src/lib/auth/sekisho.ts）。**fail-closed**。

export const onRequest = defineMiddleware(async (context, next) => {
  const { locals, request } = context;
  const env = locals.runtime?.env;

  // ローカル開発のバイパス（本番では DEV_BYPASS_AUTH を設定しないこと）
  // 万一本番に誤設定されても効かないよう、localhost からのアクセスに限定する
  if (env?.DEV_BYPASS_AUTH === 'true') {
    const hostname = new URL(request.url).hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      locals.user = { email: 'dev@localhost' };
      return next();
    }
  }

  // トークン無し・不正・期限切れ・許可メール外・関所の不調・設定漏れは 401、サービストークンは 403
  const auth = await verifyAccess(request, env);
  if (!auth.ok) {
    return new Response(auth.status === 403 ? 'Forbidden' : 'Unauthorized', { status: auth.status });
  }

  locals.user = { email: auth.email };
  return next();
});

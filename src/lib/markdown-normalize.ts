// Toast UI Editor (WYSIWYG) の getMarkdown() は `_` 等を `\_` にエスケープする
// (nhn/tui.editor#715、設定で無効化不可)。URL 内に混ざると GFM autolink が
// 途切れて astro-blog 側の埋め込み変換が壊れるため、URL 内のみエスケープを解除する。
const URL_TOKEN = /https?:\/\/[^\s<>"')]+/g;
const MD_ESCAPE = /\\([_*~`[\]()#+\-.!|{}])/g;

/** URL トークン内の Markdown エスケープ（`\_` 等）だけを解除する。本文の意図的な `\_` には触れない。 */
export function unescapeUrls(markdown: string): string {
  return markdown.replace(URL_TOKEN, (url) => url.replace(MD_ESCAPE, '$1'));
}

// WYSIWYG 内で文字として打った「---」も同様に `\-\-\-` とエスケープされ、
// サイトで区切り線(<hr>)にならず文字のまま出る。行全体が区切り線パターン
// （- * _ が3つ以上・空白可）のときだけエスケープを解除して hr として効かせる。
const ESCAPED_HR_LINE = /^[ \t]*(?:\\[-*_][ \t]*){3,}$/;

/** 行全体がエスケープ済み区切り線（`\-\-\-` 等）の行だけ、バックスラッシュを外す。 */
export function unescapeHrLines(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) => (ESCAPED_HR_LINE.test(line) ? line.replace(/\\/g, '') : line))
    .join('\n');
}

// 区切り線の行は、前に空行が無いと Markdown の setext 見出し（直前の段落に下線を引いて
// 見出しにする記法）として解釈され、上の段落まるごとが見出しに化ける。
// 空行保持の仕組みで空行は U+00A0 の行として保存されるが、これは Markdown 的には空行ではなく
// 「段落の続き」なので、見た目には空けたつもりでも必ず見出しになる（2026-08-01 の日記で実際に発生）。
// そこで保存前に、区切り線の前後へ本物の空行を確保する。

/** 行全体が区切り線（thematic break）か。CommonMark 準拠: 先頭空白3つまで・同じ記号3つ以上・間の空白可。 */
const HR_LINE = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
/** 空行保持で使う U+00A0 だけの行（Markdown 的には空行ではない）。 */
const NBSP_ONLY_LINE = /^[ \t]*\u00A0[\u00A0 \t]*$/;
/** コードフェンス（``` / ~~~）の開始・終了行。 */
const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * 区切り線の行の前後に本物の空行を確保する。
 * 隣が nbsp 行（保存済み空行）なら空行に置き換える——空行を足すと表示側で空段落が二重に出るため。
 * コードフェンスの中は一切触らない（コード中の `---` を区切り線にしない）。
 */
export function ensureHrBlankLines(markdown: string): string {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let fenceChar: string | null = null;
  let fenceLen = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(FENCE_LINE);

    if (fenceChar) {
      out.push(line);
      // 閉じフェンス: 同じ記号で開始行以上の長さ、かつその行に他の文字がない
      if (fence && fence[1][0] === fenceChar && fence[1].length >= fenceLen && line.trim() === fence[1]) {
        fenceChar = null;
      }
      continue;
    }
    if (fence) {
      fenceChar = fence[1][0];
      fenceLen = fence[1].length;
      out.push(line);
      continue;
    }
    if (!HR_LINE.test(line)) {
      out.push(line);
      continue;
    }

    // 前: nbsp 行なら空行に潰す。それ以外の非空行なら空行を挟む。
    if (out.length > 0) {
      const prev = out[out.length - 1];
      if (NBSP_ONLY_LINE.test(prev)) out[out.length - 1] = '';
      else if (prev !== '') out.push('');
    }
    out.push(line);
    // 後: 同様。次の行を直接書き換えてから通常処理に流す。
    const next = lines[i + 1];
    if (next !== undefined) {
      if (NBSP_ONLY_LINE.test(next)) lines[i + 1] = '';
      else if (next !== '') out.push('');
    }
  }

  return out.join('\n');
}

/** Toast UI の getMarkdown() 出力に対する正規化をまとめて適用する（BodyEditor から使う）。 */
export function normalizeToastMarkdown(markdown: string): string {
  return ensureHrBlankLines(unescapeHrLines(unescapeUrls(markdown)));
}

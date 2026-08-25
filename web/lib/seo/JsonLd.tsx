import { jsonLdText, type JsonLd as JsonLdData } from "./jsonLd";

/**
 * 構造化データを1件置く（S2・Issue #116）。
 *
 * **`next/script` は使わない。** JSON-LD は実行されるスクリプトではなくデータで、
 * クローラは最初のHTMLの中にあることを期待する。`strategy` はどれも「いつ実行するか」
 * の話なので、ここでは意味を持たない（`app/layout.tsx` の表示モードのスクリプトを
 * 素の `<script>` にしてあるのと同じ線）。
 */
export function JsonLd({ data }: { data: JsonLdData }) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(data) }} />
  );
}

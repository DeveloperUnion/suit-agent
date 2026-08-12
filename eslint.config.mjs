import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // エージェントの読み取りは必ず SQL 関数を経由させる。
  //
  // 網羅性の担保が app.search_customers() の中にある（確定検索は LIMIT なしで
  // 全件返す）。lib/ai/ から直接テーブルを引けると、その担保を迂回した
  // 「top-k で 12 名中 5 名だけ返す」経路が静かに生まれる。現れ方は
  // 「ゴルフ好きなのに案内が来なかった人が 7 名いる」で、誰も気づけない。
  //
  // 作法ではなく機械で止める。RLS を採ったのと同じ理由で、作法は必ず破れる。
  {
    files: ["lib/ai/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          // supabase().from(...) だけを狙う。Buffer.from / Array.from は巻き込まない
          selector:
            "CallExpression[callee.property.name='from'][callee.object.callee.name='supabase']",
          message:
            "lib/ai/ からテーブルを直接読まない。app.search_customers() を supabase().rpc() で呼ぶこと。",
        },
      ],
    },
  },
]);

export default eslintConfig;

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
        {
          // サーバ側はリクエストごとのクライアントを ctx.supabase で持ち回るので、
          // 呼び出しの形が変わる。同じ穴を塞ぐ。
          selector:
            "CallExpression[callee.property.name='from'][callee.object.property.name='supabase']",
          message:
            "lib/ai/ からテーブルを直接読まない。app.search_customers() を .rpc() で呼ぶこと。",
        },
      ],

      // 読み取りの経路を lib/data/* からも切る。
      //
      // lib/data/* は listCustomers のような「画面のための」関数を持っており、
      // そこには上限や並び順が入っている。エージェントがそれを使うと、
      // 網羅性の担保（app.search_customers の中にある）を迂回した経路が
      // 静かに生まれる。**書き込み側（適用ハンドラ）は lib/data/agent-apply.ts**
      // に置いてあり、あちらは人が「適用」を押したあとにしか動かない。
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/data/*", "../data/*", "./data/*"],
              message:
                "lib/ai/ から lib/data/* を読まない。読み取りは RPC、書き込みは lib/data/agent-apply.ts（適用ハンドラ）へ。",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;

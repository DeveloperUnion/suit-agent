"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentStaff, signInWithMagicLink, watchAuth } from "@/lib/auth/current-staff";
import { useQuery } from "@/lib/hooks/use-query";

/**
 * ログインしていなければアプリを描かない。
 *
 * 権限が人によって違う以上、システムは本人の申告でない方法で「今誰か」を
 * 知る必要がある。ここを通らずに中へ入れる経路を作らない。
 *
 * ただし守っているのはここではなく DB のほう。仮にこの画面を迂回されても、
 * app.current_staff_id() が NULL を返して全ポリシーが 0 行になる。
 * この画面は「入れないことを説明する」ためにある。
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { data: staff, loading } = useQuery(() => getCurrentStaff(), []);

  // ログイン・ログアウト・トークン更新で画面を引き直す
  useEffect(() => watchAuth(), []);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-sidebar">
        <span className="sr-only">読み込み中</span>
      </div>
    );
  }

  if (!staff) return <SignIn />;
  return <>{children}</>;
}

/**
 * 入り口はメールのリンクだけ。パスワードの欄は無い。
 *
 * ローカルでも同じ経路を通す。開発だけ抜け道を作ると、そこでしか踏まない
 * 不具合（リダイレクト先の許可、メールの文面、リンクの有効期限）が
 * 本番の初日に出る。届いたメールは Inbucket で読む。
 */
function SignIn() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await signInWithMagicLink(email);
      setSent(true);
    } catch {
      // 「このメールは登録されていません」とは出さない。
      // 招待制なので、当たっているかどうかを外から確かめられる必要がない。
      setError("サインインできませんでした。メールアドレスをご確認ください。");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-sidebar px-4">
      <Image src="/logo.png" alt="TORICO" width={132} height={36} priority className="h-9 w-auto" />

      <div className="w-full max-w-sm rounded-lg border border-sidebar-border bg-background p-6">
        {sent ? (
          <div className="flex flex-col gap-2">
            <h1 className="font-heading text-base font-medium">メールを送りました</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {email} 宛のリンクを開くとサインインできます。
              一度開けば、この端末では次から操作は要りません。
            </p>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <h1 className="font-heading text-base font-medium">サインイン</h1>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={pending || !email}>
              {pending ? "送信中…" : "リンクを送る"}
            </Button>

            <p className="text-xs leading-relaxed text-muted-foreground">
              パスワードはありません。届いたリンクを開くとサインインできます。
              アカウントは管理者が招待します。ご自身では作成できません。
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

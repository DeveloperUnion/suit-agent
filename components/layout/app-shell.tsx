"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, Menu, RotateCcw, Settings, Users, Waypoints } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useResetMockDb } from "@/lib/hooks/use-mock-db";

const NAV = [
  { href: "/dashboard", label: "ダッシュボード", icon: LayoutDashboard },
  { href: "/customers", label: "顧客", icon: Users },
  { href: "/approaches", label: "アプローチ", icon: Waypoints },
  { href: "/settings", label: "設定", icon: Settings },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" strokeWidth={1.75} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Wordmark() {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-4">
      <span className="font-heading text-[0.625rem] uppercase tracking-[0.28em] text-sidebar-foreground/60">
        Bespoke
      </span>
      <span className="font-heading text-base font-medium text-sidebar-primary">顧客カルテ</span>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const reset = useResetMockDb();

  const handleReset = () => {
    reset();
    toast.success("モックデータを初期状態に戻しました");
  };

  return (
    <div className="flex min-h-dvh">
      {/* lg 以上は常時表示のサイドナビ */}
      {/* 本文が縦に伸びてもナビとリセットは視界に残す */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <Wordmark />
        <div className="px-2">
          <NavList />
        </div>
        <div className="mt-auto p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
          >
            <RotateCcw className="size-3.5" />
            モックデータをリセット
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* lg 未満はドロワーに畳んで本文の横幅を確保する */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-11" aria-label="メニューを開く">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 border-sidebar-border bg-sidebar p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>メニュー</SheetTitle>
              </SheetHeader>
              <Wordmark />
              <div className="px-2">
                <NavList onNavigate={() => setOpen(false)} />
              </div>
              <div className="mt-auto p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  className="w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                >
                  <RotateCcw className="size-3.5" />
                  モックデータをリセット
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <span className="font-heading text-sm font-medium">顧客カルテ</span>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

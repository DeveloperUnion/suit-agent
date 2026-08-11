"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Check,
  ChevronsUpDown,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  UserRound,
  Users,
  Waypoints,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  getCurrentStaff,
  getViewingStaff,
  listStaffForSwitcher,
  setViewingStaffId,
  signOut,
} from "@/lib/auth/current-staff";
import { cn } from "@/lib/utils";
import { useQuery } from "@/lib/hooks/use-query";

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

/** ロゴは白抜きのため、暗い面（サイドバー・ドロワー・スマホのヘッダー）でだけ使う */
function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/dashboard" className={cn("flex items-center px-3 py-4", className)}>
      <Image
        src="/logo.png"
        alt="TORICO"
        width={1018}
        height={233}
        priority
        className="h-6 w-auto"
      />
    </Link>
  );
}

/**
 * ログイン中のスタッフと、管理者だけの「表示中のスタッフ」切り替え。
 *
 * 切り替えは閲覧フィルタであって、なりきりではない。
 * app.current_staff_id() は常に本人のまま動かないので、他人のページを
 * 開いている間は編集できず（RLS が 0 行にする）、監査ログにも本人が残る。
 * 一般スタッフにはこのボタン自体を出さない。
 */
function StaffSwitcher() {
  const { data } = useQuery(
    async () => ({
      me: await getCurrentStaff(),
      viewing: await getViewingStaff(),
      staff: await listStaffForSwitcher(),
    }),
    [],
  );
  if (!data?.me) return null;

  const isAdmin = data.me.role === "admin";
  const viewingOther = data.viewing && data.viewing.id !== data.me.id;

  return (
    <div className="flex flex-col gap-1 px-2 pb-2">
      <span className="px-1 font-label text-[0.6875rem] uppercase tracking-[0.14em] text-sidebar-foreground/60">
        {viewingOther ? "表示中" : "ログイン中"}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex min-h-11 items-center gap-2 rounded-md px-2 text-left text-sm text-sidebar-primary transition-colors hover:bg-sidebar-accent/50"
          >
            <UserRound className="size-4 shrink-0" strokeWidth={1.75} />
            <span className="flex-1 truncate">{data.viewing?.name ?? data.me.name}</span>
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          {isAdmin &&
            data.staff.map((staff) => (
              <DropdownMenuItem
                key={staff.id}
                onClick={() => setViewingStaffId(staff.id === data.me!.id ? null : staff.id)}
              >
                <span className="flex-1">{staff.name}</span>
                {staff.id === (data.viewing?.id ?? data.me!.id) && <Check className="size-3.5" />}
              </DropdownMenuItem>
            ))}
          {isAdmin && <DropdownMenuSeparator />}
          <DropdownMenuItem onClick={() => void signOut()}>
            <LogOut className="size-3.5" />
            <span className="flex-1">サインアウト</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {viewingOther && (
        <span className="px-1 text-[0.6875rem] leading-relaxed text-sidebar-foreground/60">
          閲覧のみ。編集はご自身の担当だけです
        </span>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-dvh">
      {/* lg 以上は常時表示のサイドナビ */}
      {/* 本文が縦に伸びてもナビとリセットは視界に残す */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <Wordmark />
        <StaffSwitcher />
        <div className="px-2">
          <NavList />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* lg 未満はドロワーに畳んで本文の横幅を確保する */}
        {/* ロゴが白抜きのため、スマホのヘッダーもサイドバーと同じ暗い面にする */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-sidebar-border bg-sidebar px-3 lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="メニューを開く"
                className="size-11 text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-primary"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 border-sidebar-border bg-sidebar p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>メニュー</SheetTitle>
              </SheetHeader>
              <Wordmark />
              <StaffSwitcher />
              <div className="px-2">
                <NavList onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <Wordmark className="py-0" />
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

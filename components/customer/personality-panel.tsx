"use client";

import { useCallback, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  addFact,
  createLabel,
  findLabel,
  invalidateFact,
  listFactCategories,
  listFacts,
  listLabels,
} from "@/lib/data/facts";
import { useQuery } from "@/lib/hooks/use-query";
import type { CustomerFact, Uuid } from "@/lib/types";
import { formatDateDot } from "@/lib/utils/date";

/**
 * パーソナルとメモ。
 *
 * 見え方は 2 つあるが、DB では同じ 1 テーブル。ラベルが付いていれば上のチップ、
 * 付いていなければ下のメモリストに出る。
 *
 * **分けて持たないのが要点。**分けるとスタッフに「これは趣味欄か、メモか」を
 * 毎回選ばせることになり、速いほう（自由記述）へ情報が逃げて確定検索から漏れる。
 * 現れ方は「ゴルフ好きなのに案内が来なかった人が 7 名いる」で、誰も気づけない。
 *
 * 消す口はメモリストの ✕ だけにしてある。チップにも置くと、同じ 1 行に
 * 入り口が 2 つできて「どちらで消したか」が分からなくなる。
 */
export function PersonalityPanel({ customerId }: { customerId: Uuid }) {
  const loadFacts = useCallback(() => listFacts(customerId), [customerId]);
  const { data: facts } = useQuery(loadFacts, [customerId]);
  const { data: categories } = useQuery(() => listFactCategories(), []);
  const { data: labels } = useQuery(() => listLabels(), []);

  const [adding, setAdding] = useState<string | null>(null);

  const rows = facts ?? [];
  const labelled = rows.filter((f) => f.label);

  // 数十件なので毎レンダー組み直してよい
  const byCategory = new Map<string, CustomerFact[]>();
  for (const fact of labelled) {
    const key = fact.label!.categoryKey;
    byCategory.set(key, [...(byCategory.get(key) ?? []), fact]);
  }

  return (
    <>
      {/* 見出しはカテゴリ。**検索の絞り込みには使わない** —
          work に分類された「ゴルフ」が「ゴルフが趣味な人」から漏れるため */}
      <div className="flex flex-col gap-2.5">
        {(categories ?? []).map((category) => (
          <div key={category.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="field-label w-20 shrink-0">{category.label}</span>
            <span className="flex flex-1 flex-wrap items-center gap-1">
              {(byCategory.get(category.key) ?? []).map((fact) => (
                <Badge key={fact.id} variant="secondary" className="font-normal">
                  {fact.label!.name}
                </Badge>
              ))}
              <button
                type="button"
                onClick={() => setAdding(category.key)}
                className="flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-brand"
                aria-label={`${category.label}を追加`}
              >
                <Plus className="size-3.5" />
              </button>
            </span>
          </div>
        ))}
      </div>

      <AddLabelDialog
        customerId={customerId}
        categoryKey={adding}
        onClose={() => setAdding(null)}
        labels={labels ?? []}
        categories={categories ?? []}
      />
    </>
  );
}

/**
 * ラベル付きの 1 行を足す。
 *
 * 既存の語に当たれば何も聞かない。カテゴリを聞くのは新しい語のときだけで、
 * 「ゴルフ」は誰にとってもゴルフなので、2 回目以降は判断が発生しない。
 */
function AddLabelDialog({
  customerId,
  categoryKey,
  onClose,
  labels,
  categories,
}: {
  customerId: Uuid;
  categoryKey: string | null;
  onClose: () => void;
  labels: { id: Uuid; name: string; categoryKey: string }[];
  categories: { key: string; label: string }[];
}) {
  const [value, setValue] = useState("");
  const [category, setCategory] = useState<string>("");
  const [pending, setPending] = useState(false);

  const open = categoryKey !== null;
  const existing = value.trim() ? findLabel(labels, value) : undefined;
  const isNew = value.trim() !== "" && !existing;

  const suggestions = value.trim()
    ? labels.filter((l) => l.name.includes(value.trim())).slice(0, 6)
    : [];

  const close = () => {
    setValue("");
    setCategory("");
    onClose();
  };

  const submit = async () => {
    const name = value.trim();
    if (!name) return;
    setPending(true);
    try {
      const label = existing ?? (await createLabel({ name, categoryKey: category || categoryKey! }));
      // 原文はラベル名そのもの。手で足すときに一言を強いると入力自体が減る
      await addFact({ customerId, labelId: label.id, body: name });
      toast.success(`${label.name} を足しました`);
      close();
    } catch {
      toast.error("足せませんでした。すでに入っているかもしれません。");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>パーソナルを足す</DialogTitle>
          <DialogDescription>
            すでにある語なら候補から選んでください。表記が揺れると、同じ趣味の方が
            ひとまとまりで引けなくなります。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fact-label">語</Label>
            <Input
              id="fact-label"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="ゴルフ"
              autoComplete="off"
              className="h-11 bg-card"
            />
          </div>

          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {suggestions.map((l) => (
                <button key={l.id} type="button" onClick={() => setValue(l.name)}>
                  <Badge variant="secondary" className="font-normal">
                    {l.name}
                  </Badge>
                </button>
              ))}
            </div>
          )}

          {/* 新しい語のときだけ分類を聞く。ラベルに 1 回持たせれば、
              2 回目以降は「これは趣味か仕事か」の判断が発生しない */}
          {isNew && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fact-category">分類（新しい語です）</Label>
              <Select value={category || categoryKey || ""} onValueChange={setCategory}>
                <SelectTrigger id="fact-category" className="h-11 w-full bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={pending}>
            キャンセル
          </Button>
          <Button onClick={() => void submit()} disabled={pending || !value.trim()}>
            足す
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * メモ。ラベルの付いていない走り書きも、付いている行も時系列で並べる。
 *
 * 上のチップが「3 秒で読む要約」で、こちらが経緯。同じ行が両方に出るのは
 * 意図したもので、片方だけ見ても困らないようにしてある。
 */
export function RecordsPanel({ customerId }: { customerId: Uuid }) {
  const loadFacts = useCallback(() => listFacts(customerId), [customerId]);
  const { data: facts } = useQuery(loadFacts, [customerId]);

  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async () => {
    const text = body.trim();
    if (!text) return;
    setPending(true);
    try {
      await addFact({ customerId, body: text });
      setBody("");
    } catch {
      toast.error("書けませんでした。同じ内容がすでに入っているかもしれません。");
    } finally {
      setPending(false);
    }
  };

  const remove = async (id: Uuid) => {
    // 消えるのは画面からだけ。行は invalidated_at を立てて残る
    await invalidateFact(id);
  };

  const rows = facts ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="高橋様のご紹介。ご子息の成人式スーツの相談を受けている（2027年予定）。"
          className="resize-none bg-card"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-9 w-fit gap-1.5"
          onClick={() => void submit()}
          disabled={pending || !body.trim()}
        >
          <Plus className="size-3.5" />
          メモする
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">まだメモがありません。</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((fact) => (
            <li
              key={fact.id}
              className="flex items-start gap-3 border-b border-border/60 py-2 last:border-b-0"
            >
              <span className="tnum w-20 shrink-0 pt-0.5 font-mono text-xs text-muted-foreground">
                {formatDateDot(fact.createdAt.slice(0, 10))}
              </span>
              <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1">
                {fact.label && (
                  <Badge variant="outline" className="font-normal">
                    {fact.label.name}
                  </Badge>
                )}
                <span className="text-sm leading-relaxed">{fact.body}</span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                onClick={() => void remove(fact.id)}
                aria-label="このメモを消す"
              >
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

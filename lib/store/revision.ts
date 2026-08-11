/**
 * 「データが変わった」を画面へ知らせるだけの器。
 *
 * モックは localStorage の中身を丸ごと持っていたので、書き込みのたびに
 * 全クエリを流し直せばよかった。DB へ移すとその前提が無くなるが、
 * 画面が使う useMockQuery の形は変えたくない（components/ を触らずに
 * データ層だけ差し替える、というのがこの移行の主張なので）。
 *
 * そこで購読だけをストアから切り離す。localStorage の mutateDb も
 * supabase-js の書き込みも、等しくここへ bump() する。
 *
 * 顧客 3,000 件・スタッフ 10 名で、他人の端末の変更を即座に反映する要件は
 * 無いため Realtime は使わない（config.toml でも無効にしてある）。
 * 自分の書き込みが自分の画面に返れば足りる。
 */

let revision = 0;
const listeners = new Set<() => void>();

/** 書き込んだあとに呼ぶ。購読しているクエリが流し直される */
export function bump(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

/** useSyncExternalStore 用 */
export function getRevision(): number {
  return revision;
}

/** SSR 時のスナップショット。クライアント初回描画と必ず一致させる */
export function getServerRevision(): number {
  return 0;
}

export function subscribeRevision(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

import { cn } from "@/lib/utils";
import type { SilhouetteRegion } from "@/lib/types";

/**
 * 人体シルエット。
 *
 * 塗りつぶさず製図線で描く（型紙と同じ描き方）。補正が入っている部位には、
 * 紙の採寸票で補正コードが○で囲まれているのと同じように、チャコで丸を書いた
 * ようなマークを重ねる。この画面で唯一の「絵」であり、他は数値と罫線に徹する。
 *
 * 座標系は 200×400。MeasurementField.silhouettePoint（0–100）は x*2, y*4 で写る。
 */

/** チャコで一息に書いた丸。終点が始点を少し追い越す */
const CHALK_PATH =
  "M -46 -8 C -46 -30 -22 -46 4 -47 C 30 -48 49 -32 48 -8 C 47 16 26 44 0 45 C -26 46 -47 28 -46 4 C -45 -12 -38 -26 -24 -35";

type Mark = { cx: number; cy: number; rx: number; ry: number; rotate: number };

/**
 * 部位ごとのマーク位置。
 * 肩や腕のように左右で 1 対になるものは 2 つ描く。重なって団子にならないよう、
 * 縦にも横にもずらしてある。
 */
const REGION_MARKS: Record<SilhouetteRegion, Mark[]> = {
  neck: [{ cx: 100, cy: 64, rx: 16, ry: 10, rotate: -4 }],
  shoulder: [
    { cx: 63, cy: 82, rx: 17, ry: 12, rotate: -10 },
    { cx: 137, cy: 82, rx: 17, ry: 12, rotate: 10 },
  ],
  chest: [{ cx: 100, cy: 110, rx: 27, ry: 17, rotate: 4 }],
  back: [{ cx: 100, cy: 143, rx: 25, ry: 16, rotate: -6 }],
  abdomen: [{ cx: 100, cy: 168, rx: 24, ry: 14, rotate: 5 }],
  hip: [{ cx: 100, cy: 191, rx: 29, ry: 14, rotate: -4 }],
  arm: [
    { cx: 46, cy: 155, rx: 13, ry: 30, rotate: 7 },
    { cx: 154, cy: 155, rx: 13, ry: 30, rotate: -7 },
  ],
  leg: [{ cx: 100, cy: 280, rx: 38, ry: 30, rotate: 3 }],
};

export type SilhouettePoint = {
  key: string;
  /** 0–100 の相対座標 */
  x: number;
  y: number;
  active?: boolean;
};

type Props = {
  highlights?: SilhouetteRegion[];
  points?: SilhouettePoint[];
  /** チャコの丸を描くアニメーションを走らせるか */
  animate?: boolean;
  /**
   * thumb は数十 px で描かれるため、線を太らせ、チャコの丸は点に置き換える。
   * 小さいまま丸を描くと重なって団子になり、人型そのものが読めなくなる。
   */
  variant?: "thumb" | "full";
  className?: string;
};

export function BodySilhouette({
  highlights = [],
  points = [],
  animate = true,
  variant = "full",
  className,
}: Props) {
  const isThumb = variant === "thumb";
  const marks = highlights.flatMap((region) =>
    (REGION_MARKS[region] ?? []).map((mark, i) => ({ ...mark, key: `${region}-${i}` })),
  );

  return (
    <svg
      viewBox="0 0 200 400"
      className={cn("h-full w-full", className)}
      role="img"
      aria-label={
        highlights.length > 0
          ? `体型補正あり（${highlights.length}部位）のシルエット`
          : "体型シルエット"
      }
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={isThumb ? 7 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={isThumb ? "text-navy/45" : "text-navy/55"}
      >
        {/* 頭部 */}
        <ellipse cx={100} cy={34} rx={20} ry={25} />
        {/* 首 */}
        <path d="M 90 56 L 90 68 M 110 56 L 110 68" />
        {/* 胴 — 肩から脇、ウエスト、腰、股まで */}
        <path d="M 90 68 C 78 70 66 72 60 78 C 68 96 70 106 70 116 C 74 132 76 140 76 150 C 74 164 70 172 70 182 C 74 190 86 196 100 197" />
        <path d="M 110 68 C 122 70 134 72 140 78 C 132 96 130 106 130 116 C 126 132 124 140 124 150 C 126 164 130 172 130 182 C 126 190 114 196 100 197" />
        {/* 腕 */}
        <path d="M 60 78 C 50 92 44 118 42 148 C 40 172 38 192 37 206" />
        <path d="M 70 116 C 62 140 56 172 53 206" />
        <path d="M 37 206 C 42 210 48 210 53 206" />
        <path d="M 140 78 C 150 92 156 118 158 148 C 160 172 162 192 163 206" />
        <path d="M 130 116 C 138 140 144 172 147 206" />
        <path d="M 163 206 C 158 210 152 210 147 206" />
        {/* 脚 */}
        <path d="M 70 182 C 68 220 66 248 66 268 C 65 306 63 344 62 366" />
        <path d="M 100 197 C 98 224 96 246 95 268 C 94 306 93 344 92 366" />
        <path d="M 62 366 L 92 366" />
        <path d="M 130 182 C 132 220 134 248 134 268 C 135 306 137 344 138 366" />
        <path d="M 100 197 C 102 224 104 246 105 268 C 106 306 107 344 108 366" />
        <path d="M 108 366 L 138 366" />
        {/* 中心線 — 製図の基準線。小さいときは省く */}
        {!isThumb && (
          <path d="M 100 66 L 100 197" strokeWidth={1} strokeDasharray="3 5" className="text-navy/25" />
        )}
      </g>

      {/* 採寸項目の位置。製図の寸法点として置く */}
      {points.length > 0 && (
        <g>
          {points.map((point) => (
            <circle
              key={point.key}
              cx={point.x * 2}
              cy={point.y * 4}
              r={point.active ? 5 : 2.6}
              className={cn(
                "transition-all",
                point.active ? "fill-navy stroke-white" : "fill-navy/35 stroke-none",
              )}
              strokeWidth={2}
            />
          ))}
        </g>
      )}

      {/* 補正マーク — 紙で補正コードを○で囲むのと同じ意味 */}
      {isThumb
        ? marks.map((mark) => (
            <circle
              key={mark.key}
              cx={mark.cx}
              cy={mark.cy}
              r={11}
              className="fill-thread/80"
            />
          ))
        : marks.map((mark, i) => (
        <path
          key={mark.key}
          d={CHALK_PATH}
          transform={`translate(${mark.cx},${mark.cy}) rotate(${mark.rotate}) scale(${mark.rx / 48},${mark.ry / 46})`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          /* pathLength で長さを正規化しておくと、拡大率が違ってもアニメーションが揃う */
          pathLength={100}
          className={cn("text-thread/70", animate && "chalk-mark")}
          style={{
            animationDelay: animate ? `${i * 90}ms` : undefined,
            ["--chalk-len" as string]: "100",
          }}
        />
          ))}
    </svg>
  );
}

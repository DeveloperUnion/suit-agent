import { cn } from "@/lib/utils";
import type { SilhouetteCorrection, SilhouetteRegion } from "@/lib/types";

/**
 * 人体シルエット。
 *
 * 塗りつぶした人型ではなく、型紙の製図として描く。輪郭は一本の線で取り、
 * 肩線・バストライン・ウエストライン・ヒップライン・膝線を細い破線の基準線として
 * 重ねる。採寸項目の位置がこの基準線の上に乗るため、図と数値が対応する。
 *
 * 補正が入っている部位には、紙の採寸票で補正コードを○で囲むのと同じマークを重ねる。
 * この画面で唯一の「絵」であり、他は数値と罫線に徹する。
 *
 * 座標系は 200×400。MeasurementField.silhouettePoint（0–100）は x*2, y*4 で写る。
 */

/** チャコで一息に書いた丸。終点が始点を少し追い越す */
const CHALK_PATH =
  "M -46 -8 C -46 -30 -22 -46 4 -47 C 30 -48 49 -32 48 -8 C 47 16 26 44 0 45 C -26 46 -47 28 -46 4 C -45 -12 -38 -26 -24 -35";

/**
 * 首・肩・腕・胴・脚を一筆の閉じた輪郭で取る。
 * パーツを分けて描くと肩と腕の境目に継ぎ目が出て、人形のように見えてしまう。
 */
const BODY_PATH = `
M 91 51
L 89 66
C 79 69 68 73 60 82
C 55 95 51 100 53 112
C 49 150 46 185 46 208
C 46 216 47 221 50 221
C 52 221 53 216 53 208
C 54 185 58 150 62 116
C 64 110 66 107 69 104
C 72 126 75 140 76 152
C 73 168 70 176 70 186
C 69 196 68 200 69 208
C 71 235 72 252 73 268
C 72 300 75 330 77 356
L 77 366 L 92 366 L 91 356
C 90 330 89 300 89 268
C 90 250 93 228 97 208
L 100 203
L 103 208
C 107 228 110 250 111 268
C 111 300 110 330 109 356
L 109 366 L 124 366 L 123 356
C 125 330 128 300 127 268
C 128 252 129 235 131 208
C 132 200 131 196 130 186
C 130 176 127 168 124 152
C 125 140 128 126 131 104
C 134 107 136 110 138 116
C 142 150 146 185 147 208
C 147 216 148 221 150 221
C 153 221 154 216 154 208
C 154 185 151 150 147 112
C 149 100 145 95 140 82
C 132 73 121 69 111 66
L 109 51
Z
`;

/** 製図の基準線。ラベルは付けず、線だけで位置を示す */
const GUIDE_LINES: { y: number; x1: number; x2: number }[] = [
  { y: 82, x1: 46, x2: 154 }, // 肩線
  { y: 104, x1: 52, x2: 148 }, // バストライン
  { y: 152, x1: 58, x2: 142 }, // ウエストライン
  { y: 186, x1: 52, x2: 148 }, // ヒップライン
  { y: 268, x1: 58, x2: 142 }, // 膝線
];

type Mark = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotate: number;
  /** 補正コードの番号をどちら側に置くか */
  labelSide: "left" | "right";
};

/**
 * 部位ごとのマーク位置。
 * 肩や腕のように左右で 1 対になるものは 2 つ描く。重なって団子にならないよう、
 * 縦にも横にもずらしてある。
 */
const REGION_MARKS: Record<SilhouetteRegion, Mark[]> = {
  neck: [{ cx: 100, cy: 60, rx: 22, ry: 13, rotate: -4, labelSide: "right" }],
  shoulder: [
    { cx: 63, cy: 80, rx: 20, ry: 13, rotate: -10, labelSide: "left" },
    { cx: 137, cy: 80, rx: 20, ry: 13, rotate: 10, labelSide: "right" },
  ],
  chest: [{ cx: 100, cy: 108, rx: 30, ry: 18, rotate: 4, labelSide: "right" }],
  back: [{ cx: 100, cy: 140, rx: 27, ry: 17, rotate: -6, labelSide: "left" }],
  abdomen: [{ cx: 100, cy: 166, rx: 26, ry: 15, rotate: 5, labelSide: "right" }],
  hip: [{ cx: 100, cy: 187, rx: 32, ry: 15, rotate: -4, labelSide: "left" }],
  arm: [
    { cx: 50, cy: 160, rx: 14, ry: 32, rotate: 6, labelSide: "left" },
    { cx: 150, cy: 160, rx: 14, ry: 32, rotate: -6, labelSide: "right" },
  ],
  leg: [{ cx: 100, cy: 278, rx: 38, ry: 28, rotate: 3, labelSide: "right" }],
};

type Props = {
  corrections?: SilhouetteCorrection[];
  /** チャコの丸を描くアニメーションを走らせるか */
  animate?: boolean;
  /**
   * thumb は数十 px で描かれるため、線を太らせ、基準線と番号を省き、
   * チャコの丸は点に置き換える。小さいまま丸を描くと重なって団子になり、
   * 人型そのものが読めなくなる。
   */
  variant?: "thumb" | "full";
  className?: string;
};

export function BodySilhouette({
  corrections = [],
  animate = true,
  variant = "full",
  className,
}: Props) {
  const isThumb = variant === "thumb";
  const marks = corrections.flatMap((correction) =>
    (REGION_MARKS[correction.region] ?? []).map((mark, i) => ({
      ...mark,
      code: correction.code,
      // 左右 1 対の部位でも番号は片方にだけ添える。両方に出すとうるさい
      showLabel: i === 0,
      key: `${correction.region}-${correction.code}-${i}`,
    })),
  );

  return (
    <svg
      viewBox="0 0 200 400"
      className={cn("h-full w-full", className)}
      role="img"
      aria-label={
        corrections.length > 0
          ? `補正${corrections.length}件が入った体型シルエット`
          : "体型シルエット"
      }
    >
      {/* 基準線 — 製図用紙の当たり。thumb では省く */}
      {!isThumb && (
        <g stroke="currentColor" strokeWidth={0.9} strokeDasharray="4 5" className="text-navy/30">
          {GUIDE_LINES.map((line) => (
            <line key={line.y} x1={line.x1} y1={line.y} x2={line.x2} y2={line.y} />
          ))}
          <line x1={100} y1={48} x2={100} y2={205} />
        </g>
      )}

      {/* 輪郭 */}
      <g
        stroke="currentColor"
        strokeWidth={isThumb ? 6 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={isThumb ? "text-navy/45" : "text-navy/70"}
      >
        <ellipse cx={100} cy={29} rx={16} ry={21} className="fill-navy/[0.06]" />
        <path d={BODY_PATH} className="fill-navy/[0.06]" />
      </g>

      {/* 補正マーク — 紙で補正コードを○で囲むのと同じ意味。番号を添えて何の丸か示す */}
      {isThumb
        ? marks.map((mark) => (
            <circle key={mark.key} cx={mark.cx} cy={mark.cy} r={11} className="fill-thread/80" />
          ))
        : marks.map((mark, i) => (
            <g key={mark.key}>
              <path
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
              {mark.showLabel && (
                <text
                  x={mark.labelSide === "right" ? mark.cx + mark.rx + 6 : mark.cx - mark.rx - 6}
                  y={mark.cy + 4}
                  textAnchor={mark.labelSide === "right" ? "start" : "end"}
                  className="fill-thread font-mono text-[12px]"
                >
                  {mark.code}
                </text>
              )}
            </g>
          ))}
    </svg>
  );
}

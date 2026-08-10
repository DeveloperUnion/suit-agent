"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * 音声入力。押している間だけ聞き、離したら入力欄に入れる。
 *
 * 接客直後にスマホを片手で持ったまま「時枝さんゴルフが趣味らしい」と打つのは
 * 現実には重い。ここが軽くないと、聞いた話はカルテに残らない。
 *
 * 確定しても送信はしない。認識は必ず外すので、送る前に手で直せる状態で止める。
 *
 * 型を global に足していないのは、SpeechRecognition が lib.dom にあるかどうかが
 * TypeScript のバージョンで変わり、重複宣言になるため。必要な形だけここに持つ。
 */

type SpeechAlternative = { transcript: string };
type SpeechResult = ArrayLike<SpeechAlternative> & { isFinal: boolean };
type SpeechResultEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type SpeechErrorEvent = { error: string };

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type RecognitionCtor = new () => Recognition;

function getRecognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/**
 * iOS Safari は continuous を無視して無音のたびに終わる。
 * 指がまだ下りている間は繋ぎ直すが、権限まわりで即 onend する端末もあるので上限を置く。
 */
const MAX_RESTARTS = 5;

/** 対応の有無はレンダー中に変わらない。SSR とクライアント初回描画を揃えるため false から始める */
const subscribeNever = () => () => {};
const hasRecognition = () => Boolean(getRecognitionCtor());
const hasRecognitionOnServer = () => false;

export type SpeechInput = {
  supported: boolean;
  listening: boolean;
  /** 認識中の暫定テキスト。確定すると空になる */
  interim: string;
  start: () => void;
  stop: () => void;
};

export function useSpeechRecognition(options: {
  /** 確定するたびに呼ばれる。入力欄へ追記する */
  onResult: (text: string) => void;
  /** 使えないと分かったとき。1 度だけ案内を出す用 */
  onUnavailable?: (reason: string) => void;
}): SpeechInput {
  const { onResult, onUnavailable } = options;

  const available = useSyncExternalStore(subscribeNever, hasRecognition, hasRecognitionOnServer);
  /** 権限を断られた等、この場では使えないと分かった状態。ボタンごと引っ込める */
  const [blocked, setBlocked] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");

  const recognitionRef = useRef<Recognition | null>(null);
  /** 指が下りているか。onend で繋ぎ直すかの判断に使う */
  const holdingRef = useRef(false);
  /** start() が実際に始まる前に離されたとき、onstart で即止めるための旗 */
  const pendingStopRef = useRef(false);
  const runningRef = useRef(false);
  const restartsRef = useRef(0);

  const stop = () => {
    holdingRef.current = false;
    if (!runningRef.current) {
      // start() の実体が始まる前に離された。onstart で止める
      pendingStopRef.current = true;
      return;
    }
    // abort() は保留中の結果を捨てるので使わない。stop() なら最後の確定が届く
    recognitionRef.current?.stop();
  };

  const start = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || runningRef.current) return;

    holdingRef.current = true;
    pendingStopRef.current = false;
    restartsRef.current = 0;
    setInterim("");

    const recognition = new Ctor();
    recognition.lang = "ja-JP";
    // false だと一息ついた時点で勝手に終わる。押している間はずっと聞きたい
    recognition.continuous = true;
    // 無いと確定まで画面が無反応になり、拾えているのか分からない
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      runningRef.current = true;
      setListening(true);
      // 権限プロンプトが出ている間に離された場合はここで畳む
      if (pendingStopRef.current) {
        pendingStopRef.current = false;
        recognition.stop();
      }
    };

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      setInterim(interimText);
      if (finalText) onResult(finalText);
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      holdingRef.current = false;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setBlocked(true);
        onUnavailable?.("マイクを使えませんでした");
        return;
      }
      if (event.error === "network") {
        onUnavailable?.("音声認識に接続できませんでした");
      }
    };

    recognition.onend = () => {
      runningRef.current = false;
      // iOS は continuous を無視して無音で終わる。まだ押していれば繋ぎ直す
      if (holdingRef.current && restartsRef.current < MAX_RESTARTS) {
        restartsRef.current += 1;
        try {
          recognition.start();
          return;
        } catch {
          // 直後に再開できない端末がある。諦めて畳む
        }
      }
      holdingRef.current = false;
      setListening(false);
      setInterim("");
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      // 既に走っている場合などはここに来る。状態だけ戻す
      runningRef.current = false;
      holdingRef.current = false;
      setListening(false);
    }
  };

  useEffect(() => {
    return () => {
      holdingRef.current = false;
      if (runningRef.current) recognitionRef.current?.stop();
    };
  }, []);

  return { supported: available && !blocked, listening, interim, start, stop };
}

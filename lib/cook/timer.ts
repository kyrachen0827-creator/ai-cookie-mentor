/**
 * 步驟計時的純函式（cooking-teacher-agent.md B：需要等待的步驟提供計時，時間到提醒）。
 *
 * 以「結束時間點」計算剩餘時間，而不是每秒減一：
 * 瀏覽器在背景分頁會放慢 setInterval，用時間點計算才不會越算越慢。
 */
const MS_PER_MINUTE = 60_000;
const MS_PER_SECOND = 1_000;

export function timerEndsAt(minutes: number, now: number): number {
  return now + Math.round(minutes * MS_PER_MINUTE);
}

/** 剩餘秒數（無條件進位，最後一秒內仍顯示 1；時間到之後為 0） */
export function remainingSeconds(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / MS_PER_SECOND));
}

/** 例：65 → "1:05" */
export function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

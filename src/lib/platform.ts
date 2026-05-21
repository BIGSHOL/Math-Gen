/**
 * OS / platform 감지 헬퍼.
 *
 * 단축키 UI 표시 분기에 사용:
 *   - Mac: ⌘ (Cmd), ⌥ (Option), ⇧ (Shift)
 *   - Windows / Linux: Ctrl, Alt, Shift
 *
 * 키 *핸들러* 는 React event 의 `e.metaKey || e.ctrlKey` 로 이미 OS-aware —
 * 이 헬퍼는 *UI 표시 전용*.
 *
 * SSR 안전: `navigator` 없으면 false (Windows 가정).
 */
export const isMac = (): boolean => {
  if (typeof navigator === "undefined") return false;
  // `navigator.platform` 은 deprecated 지만 `userAgentData` 가 아직 모든
  // 브라우저 지원 X — userAgent 와 platform 둘 다 체크.
  const platform = navigator.platform || "";
  const ua = navigator.userAgent || "";
  return /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac OS X/i.test(ua);
};

/**
 * Modifier 키 라벨 — Mac 은 ⌘/⌥/⇧ 심볼, Windows/Linux 는 Ctrl/Alt/Shift.
 *
 * 사용 예:
 *   <Kbd>{modKey()}</Kbd>  →  ⌘ or Ctrl
 */
export const modKey = (): string => (isMac() ? "⌘" : "Ctrl");
export const altKey = (): string => (isMac() ? "⌥" : "Alt");
export const shiftKey = (): string => (isMac() ? "⇧" : "Shift");

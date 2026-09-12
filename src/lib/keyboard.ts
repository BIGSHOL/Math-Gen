/** MathLive의 Shadow DOM과 본문 편집기까지 포함해 입력 중인 키를 판별한다. */
export function isTextInputEvent(event: KeyboardEvent): boolean {
  return event.isComposing || event.composedPath().some(target => target instanceof HTMLElement && (
    target.matches('input, textarea, select, math-field, [role="textbox"]') || target.isContentEditable
  ));
}

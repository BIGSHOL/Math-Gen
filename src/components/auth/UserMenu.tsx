import { useEffect, useRef, useState } from "react";
import { Avatar, Btn, Divider } from "@app/components/ui";
import { ModalShell } from "@app/components/modal";
import { supabase } from "@app/services/api/supabase";
import { useAuthStore } from "@app/stores/authStore";
import { PasswordChangeModal } from "./PasswordChangeModal";

/**
 * Phase G — TopBar 우측 사용자 메뉴.
 *
 * `!supabase` (flag off) 또는 비로그인이면 기존 `<Avatar />` 를 그대로 렌더 —
 * 외형 불변. 로그인 상태면 Avatar 클릭 시 이메일 + 비밀번호 변경 + 로그아웃
 * 드롭다운. 비밀번호 변경은 ModalShell 을 직접 렌더 (appStore.modal 미사용).
 */
export const UserMenu = () => {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // flag off 또는 비로그인 — 기존 Avatar 외형 그대로.
  if (!supabase || !user) return <Avatar />;

  const email = user.email ?? "사용자";
  const initial = email.charAt(0).toUpperCase();

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="사용자 메뉴"
          className="block rounded-full focus-visible:outline-none focus-visible:shadow-accent-glow"
        >
          <Avatar name={initial} />
        </button>

        {open && (
          <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[220px] rounded-r3 border border-line bg-surface shadow-s3 p-1.5">
            <div className="px-2.5 py-1.5">
              <div className="text-caption text-muted">로그인 계정</div>
              <div className="text-small text-text truncate" title={email}>
                {email}
              </div>
            </div>
            <Divider className="my-1" />
            <Btn
              kind="ghost"
              size="sm"
              full
              icon="key"
              className="justify-start"
              onClick={() => {
                setOpen(false);
                setPwOpen(true);
              }}
            >
              비밀번호 변경
            </Btn>
            <Btn
              kind="ghost"
              size="sm"
              full
              icon="sign-out"
              className="justify-start"
              onClick={() => {
                setOpen(false);
                void signOut();
              }}
            >
              로그아웃
            </Btn>
          </div>
        )}
      </div>

      <ModalShell
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        aria-labelledby="password-change-title"
      >
        <PasswordChangeModal onClose={() => setPwOpen(false)} />
      </ModalShell>
    </>
  );
};

export default UserMenu;

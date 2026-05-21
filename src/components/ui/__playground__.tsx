import { useState } from "react";
import {
  Avatar,
  Backdrop,
  Btn,
  Card,
  Chip,
  Divider,
  Eyebrow,
  Heading,
  Icon,
  Input,
  Kbd,
  Logo,
  ModKey,
  Progress,
  Segmented,
  StatCard,
  Toggle,
  TopBar,
} from "./index";

/**
 * Visual playground for the design system primitives. Render this page by
 * setting `?ui` in the URL (handled in App.tsx during Phase 0–1 only).
 * Remove from App once Phase 2 routing lands.
 */
export const UIPlayground = () => {
  const [toggle1, setToggle1] = useState(false);
  const [toggle2, setToggle2] = useState(true);
  const [seg, setSeg] = useState("middle");
  const [text, setText] = useState("");
  const [showBackdrop, setShowBackdrop] = useState(false);

  return (
    <div className="min-h-screen bg-bg text-text font-sans">
      <TopBar
        left={
          <>
            <Logo />
            <Chip tone="accent" size="sm">
              UI playground
            </Chip>
          </>
        }
        right={
          <>
            <Btn kind="ghost" size="sm" icon="bell">
              Notifications
            </Btn>
            <Avatar name="김" />
          </>
        }
      />

      <main className="max-w-[1200px] mx-auto px-8 py-8 space-y-12">
        {/* Buttons */}
        <section>
          <Heading level="h1" sub="모든 kind × size — hover / disabled 상태 검수">
            Buttons
          </Heading>
          <div className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 items-center">
            {(["primary", "accent", "secondary", "ghost", "soft", "softWarn", "danger"] as const).map((k) => (
              <FragmentRow key={k} label={k}>
                {(["xs", "sm", "md", "lg"] as const).map((s) => (
                  <Btn key={s} kind={k} size={s} icon="play">
                    {s.toUpperCase()}
                  </Btn>
                ))}
                <Btn kind={k} size="md" disabled>
                  disabled
                </Btn>
              </FragmentRow>
            ))}
          </div>
        </section>

        {/* Chips */}
        <section>
          <Heading level="h1">Chips</Heading>
          <div className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 items-center">
            {(["neutral", "soft", "accent", "ok", "warn", "danger"] as const).map((t) => (
              <FragmentRow key={t} label={t}>
                <Chip tone={t} size="sm">
                  sm
                </Chip>
                <Chip tone={t} size="md" dot>
                  md + dot
                </Chip>
                <Chip tone={t} size="lg" icon="check">
                  lg + icon
                </Chip>
              </FragmentRow>
            ))}
          </div>
        </section>

        {/* Cards */}
        <section>
          <Heading level="h1">Cards</Heading>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <Card>
              <Eyebrow icon="info">Static</Eyebrow>
              <div className="mt-2 text-body text-text">기본 카드, shadow-s1.</div>
            </Card>
            <Card interactive>
              <Eyebrow icon="cursor-click">Interactive</Eyebrow>
              <div className="mt-2 text-body text-text">호버 시 lift + shadow-s3.</div>
            </Card>
            <Card pad={24}>
              <Eyebrow icon="resize">pad=24</Eyebrow>
              <div className="mt-2 text-body text-text">패딩 커스터마이즈.</div>
            </Card>
          </div>
        </section>

        {/* Inputs */}
        <section>
          <Heading level="h1">Inputs</Heading>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <Input label="이름" placeholder="홍길동" value={text} onChange={(e) => setText(e.target.value)} />
            <Input label="비밀번호" placeholder="••••••••" type="password" size="sm" />
            <Input
              label="파일명"
              placeholder="exam-2024-06"
              suffix=".pdf"
              mono
            />
          </div>
        </section>

        {/* Toggles & Segmented */}
        <section>
          <Heading level="h1">Toggles · Segmented</Heading>
          <div className="mt-4 grid grid-cols-2 gap-6">
            <Card>
              <div className="space-y-4">
                <Toggle value={toggle1} onChange={setToggle1} label="해설 포함" hint="변형 시험지에 풀이 페이지를 추가합니다." />
                <Toggle value={toggle2} onChange={setToggle2} label="자동 채점" hint="OMR 호환 답안지를 생성합니다." size="sm" />
                <Toggle value={false} onChange={() => undefined} label="협업 (준비 중)" disabled />
              </div>
            </Card>
            <Card>
              <div className="space-y-4">
                <Segmented
                  value={seg}
                  onChange={setSeg}
                  options={[
                    { value: "easier", label: "쉽게", icon: "arrow-down" },
                    { value: "middle", label: "같게", icon: "equals" },
                    { value: "harder", label: "어렵게", icon: "arrow-up" },
                  ]}
                />
                <Segmented
                  value={seg}
                  onChange={setSeg}
                  size="sm"
                  full
                  options={[
                    { value: "easier", label: "쉽게" },
                    { value: "middle", label: "같게" },
                    { value: "harder", label: "어렵게" },
                  ]}
                />
              </div>
            </Card>
          </div>
        </section>

        {/* Kbd, Divider, Icon */}
        <section>
          <Heading level="h1">Kbd · Divider · Icon</Heading>
          <div className="mt-4 flex items-center gap-3 text-small text-text2">
            <span>저장하기</span>
            <ModKey />
            <Kbd>S</Kbd>
            <Divider vertical className="h-4" />
            <span>닫기</span>
            <Kbd>Esc</Kbd>
            <Divider vertical className="h-4" />
            <Icon name="star" weight="fill" size={20} color="#F59E0B" />
            <Icon name="heart" weight="duotone" size={20} color="#EF4444" />
            <Icon name="lightning" weight="bold" size={20} />
          </div>
          <Divider className="mt-4" />
        </section>

        {/* StatCards */}
        <section>
          <Heading level="h1">Stat cards</Heading>
          <div className="mt-4 grid grid-cols-4 gap-4">
            <StatCard icon="files" label="총 시험지" value="124" unit="개" trend="+12" tone="accent" />
            <StatCard icon="check-circle" label="완료" value="98" unit="개" trend="+4" trendTone="ok" tone="ok" />
            <StatCard icon="warning" label="검토 필요" value="6" unit="건" trend="-2" trendTone="warn" tone="warn" />
            <StatCard icon="chart-line" label="평균 정답률" value="78" unit="%" />
          </div>
        </section>

        {/* Progress */}
        <section>
          <Heading level="h1">Progress</Heading>
          <div className="mt-4 max-w-[480px] space-y-4">
            <Progress
              value={88}
              tone="ok"
              label={
                <>
                  <span className="text-text2">다항식</span>
                  <span className="text-muted">6 문항 · 88%</span>
                </>
              }
            />
            <Progress
              value={65}
              tone="accent"
              label={
                <>
                  <span className="text-text2">삼각함수</span>
                  <span className="text-muted">5 문항 · 65%</span>
                </>
              }
            />
            <Progress
              value={42}
              tone="warn"
              label={
                <>
                  <span className="text-text2">미적분</span>
                  <span className="text-muted">8 문항 · 42%</span>
                </>
              }
            />
          </div>
        </section>

        {/* Backdrop */}
        <section>
          <Heading level="h1">Backdrop</Heading>
          <div className="mt-4">
            <Btn kind="accent" icon="rectangle" onClick={() => setShowBackdrop(true)}>
              Show backdrop
            </Btn>
          </div>
        </section>
      </main>

      {showBackdrop && (
        <Backdrop onClick={() => setShowBackdrop(false)}>
          <Card className="max-w-[420px] animate-modal-enter" pad={24} onClick={(e) => e.stopPropagation()}>
            <Heading level="h2" sub="backdrop 위 카드 — ESC 또는 바깥 클릭으로 닫힘">
              Backdrop demo
            </Heading>
            <p className="mt-3 text-body text-text2">
              Phase 3에서 모달 셸로 재사용됩니다. 현재는 사이즈/애니메이션 검수용.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Btn kind="ghost" onClick={() => setShowBackdrop(false)}>
                닫기
              </Btn>
              <Btn kind="accent" onClick={() => setShowBackdrop(false)}>
                확인
              </Btn>
            </div>
          </Card>
        </Backdrop>
      )}
    </div>
  );
};

const FragmentRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <>
    <div className="text-caption text-muted uppercase tracking-wider">{label}</div>
    <div className="flex flex-wrap items-center gap-2">{children}</div>
  </>
);

export default UIPlayground;

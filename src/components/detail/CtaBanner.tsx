import { Btn, Icon } from "@app/components/ui";

export interface CtaBannerProps {
  onLaunch: () => void;
}

/**
 * Gradient "변형 만들기" CTA at the bottom of the Detail content column.
 * Echoes the same accent gradient used on the Logo so the brand color
 * carries through the workflow.
 */
export const CtaBanner = ({ onLaunch }: CtaBannerProps) => (
  <div
    className="mt-8 p-[22px] rounded-r4 flex justify-between items-center gap-[22px] border"
    style={{
      background: "linear-gradient(135deg, #E0F2FE, #FFFFFF)",
      borderColor: "#BAE6FD",
    }}
  >
    <div className="flex gap-3.5 items-center">
      <div
        className="grid place-items-center text-white shadow-s2 rounded-r2"
        style={{
          width: 40,
          height: 40,
          background: "linear-gradient(135deg, #0EA5E9, #075985)",
        }}
      >
        <Icon name="sparkle" size={20} weight="fill" color="white" />
      </div>
      <div>
        <div className="text-h2 mb-0.5" style={{ color: "#0C4A6E" }}>
          이 시험지로 변형 시험지 만들기
        </div>
        <div className="text-body text-text2">
          난이도·유형·문항을 미세 조정해서 새 시험지 N개를 한 번에 생성합니다.
        </div>
      </div>
    </div>
    <Btn kind="accent" size="lg" iconRight="arrow-right" onClick={onLaunch}>
      변형 만들기
    </Btn>
  </div>
);

export default CtaBanner;

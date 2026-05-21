/**
 * AI 모델 id 를 *짧은 UI 라벨* 로 변환.
 *
 * 카드·배지·툴팁 등 좁은 공간에 표시할 때 사용. 알려진 모델은 4~7 글자
 * 약어 (Sonnet, Opus, G3.1P, GPT5.5 …), 미지의 모델은 앞 7글자 + ellipsis.
 *
 * 사용처: PageThumbColumn (페이지 단위 dev 배지), OCRItem (문항 단위 모델
 * chip — task #99). 두 곳이 같은 함수 공유.
 */
export const modelShortName = (model: string | undefined | null): string => {
  if (!model) return "";
  switch (model) {
    case "gemini-3-flash-preview":
      return "G3F";
    case "gemini-3.5-flash":
      return "G3.5F";
    case "gemini-3.1-pro-preview":
      return "G3.1P";
    case "gemini-3.1-flash-lite":
      return "G3.1FL";
    case "gemini-2.5-flash":
      return "G2.5F";
    case "gemini-2.5-pro":
      return "G2.5P";
    case "gpt-5.5":
      return "GPT5.5";
    case "gpt-5.5-pro":
      return "GPT5.5P";
    case "gpt-5":
      return "GPT5";
    case "claude-sonnet-4-6":
      return "Sonnet";
    case "claude-opus-4-7":
      return "Opus";
    case "claude-haiku-4-5":
      return "Haiku";
    default:
      return model.length > 8 ? `${model.slice(0, 7)}…` : model;
  }
};

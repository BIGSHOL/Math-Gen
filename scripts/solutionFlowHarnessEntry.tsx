import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useSolutionGen } from "../src/hooks/useSolutionGen";
import { WizardScreen } from "../src/components/wizard/WizardScreen";
import { useWizardStore, type OCRProblem, type WizardPage } from "../src/stores/wizardStore";

export { useWizardStore } from "../src/stores/wizardStore";
export { putPageImage, putThumbnail } from "../src/lib/imageStore";

let root: Root | undefined;

const item = (index: number): OCRProblem => ({
  id: `solution-item-${index}`,
  number: index + 1,
  text: `문항 ${index + 1}. 방정식 $x+${index}=10$을 푸시오.`,
  status: "ok",
  reviewed: true,
});

const page = (count: number): WizardPage => ({
  id: "solution-page",
  imageRef: "",
  thumbRef: "",
  rotation: 0,
  textLayer: "",
  isProblemPage: true,
  cropInspected: true,
  ocrComplete: true,
  ocrTextComplete: true,
  cropBoxes: [],
  ocrResult: Array.from({ length: count }, (_, index) => item(index)),
});

function SolutionHarness() {
  useSolutionGen();
  return <div>해설 생성 시험</div>;
}

export function seedSolutions(count: number) {
  useWizardStore.setState({
    pages: [page(count)],
    step: 3,
    furthestStep: 3,
    selectedGrade: "middle1",
    skipSolutions: false,
    solutionConfirmed: false,
  });
}

export function mountSolutions() {
  root?.unmount();
  root = createRoot(document.getElementById("root")!);
  root.render(<StrictMode><SolutionHarness /></StrictMode>);
}

export function seedWizard(imageRef: string, thumbRef: string) {
  const seeded = page(1);
  seeded.id = "skip-page";
  seeded.imageRef = imageRef;
  seeded.thumbRef = thumbRef;
  seeded.ocrResult[0].id = "skip-item";
  useWizardStore.setState({
    pages: [seeded],
    step: 2,
    furthestStep: 2,
    activePageIndex: 0,
    testId: null,
    uploadedFileName: "skip-test.pdf",
    justHydrated: true,
    ocrConfirmed: false,
    solutionConfirmed: false,
    skipSolutions: false,
  });
}

export function mountWizard() {
  root?.unmount();
  root = createRoot(document.getElementById("root")!);
  root.render(<StrictMode><WizardScreen /></StrictMode>);
}

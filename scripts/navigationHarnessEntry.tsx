import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "../App";
import { AuthScreen } from "../src/components/auth/AuthScreen";
import { installBrowserNavigation } from "../src/lib/browserNavigation";
import { useAppStore } from "../src/stores/appStore";
import { useWizardStore, type WizardPage } from "../src/stores/wizardStore";
import { useLibraryStore } from "../src/stores/libraryStore";
import { useAuthStore } from "../src/stores/authStore";
import { useAdminStore } from "../src/stores/adminStore";
import { putPageImage, putThumbnail, getPageImage } from "../src/lib/imageStore";
import { buildDigitizeReviews } from "../src/lib/problemAdapter";
export { useAppStore, useWizardStore, useLibraryStore, useAuthStore, useAdminStore, getPageImage };
export { authClient } from "../src/services/api/supabase";

let root: Root | undefined;
export function mountNavigation(auth = false) {
  installBrowserNavigation();
  root ??= createRoot(document.getElementById("root")!);
  root.render(<StrictMode>{auth ? <AuthScreen /> : <App />}</StrictMode>);
}
export async function seedWizard(step = 0) {
  const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 840;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "white"; context.fillRect(0, 0, 640, 840);
  context.fillStyle = "black"; context.font = "20px serif"; context.fillText("1. x + 1 = 2", 50, 60);
  const dataUrl = canvas.toDataURL();
  const imageRef = await putPageImage({ pageNum: 1, dataUrl });
  const thumbRef = await putThumbnail({ pageNum: 1, dataUrl });
  const pages: WizardPage[] = [{ id: "nav-page", imageRef, thumbRef, rotation: 0, textLayer: "", isProblemPage: true,
    cropBoxes: [{ id: "nav-crop", class: "problem", number: 1, bbox: [30, 30, 150, 950], verified: true, source: "user", figureCrops: [] }],
    cropInspected: true, ocrComplete: true, ocrTextComplete: true,
    ocrResult: [{ id: "nav-question", number: 1, text: "방정식 $x+1=2$를 푸시오.", status: "ok", reviewed: true, solution: "$x=1$", answer: "1" }] }];
  useWizardStore.setState({ testId: "t1", pages, step: step as 0, furthestStep: step as 0,
    uploadedFileName: "navigation.pdf", justHydrated: true, skipSolutions: false, ocrConfirmed: true, solutionConfirmed: true,
    goal: "digitize", problems: buildDigitizeReviews(pages) });
  useAppStore.getState().startWizard("t1");
}

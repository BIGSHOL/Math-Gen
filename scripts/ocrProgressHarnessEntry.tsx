import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Step2OCRReview } from '../src/components/wizard/Step2OCRReview';
export { useWizardStore } from '../src/stores/wizardStore';
export { putPageImage, putThumbnail } from '../src/lib/imageStore';
export { redrawFigureCrop, redrawQuestionFigures } from '../src/services/ai/figurePipeline';
export { loadTestchangeExams } from '../src/services/api/testchange';
export const mount = () => {
  const root = createRoot(document.getElementById('root')!);
  root.render(<StrictMode><Step2OCRReview /></StrictMode>);
  return () => root.unmount();
};

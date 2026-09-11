import { useState } from 'react';
import { Btn } from '../ui';
import { loadTestchangeExam } from '../../services/api/testchange';
import { testchangeToHwp } from '../../lib/testchangeAdapter';
import { sanitizeFilename } from '../../lib/filename';

/** 원본 엔진 봉투를 최신 도우미에 전달 — 도형 spec/SVG와 원래 배점 표기를 보존한다. */
export function TestchangeHwpExport({ testId }: { testId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const connector = await import('../../services/api/hwpConnector');
      const [health, data] = await Promise.all([connector.detectConnector(), loadTestchangeExam(testId)]);
      if (!health?.hwp_com) throw new Error('한글이 설치된 PC에서 HWP 도우미를 실행해 주세요.');
      const payload = testchangeToHwp(data);
      let blob: Blob;
      try { blob = await connector.convertToHwp(payload, connector.getStoredToken()); }
      catch (e) {
        if (!(e instanceof connector.HwpConnectorError) || e.status !== 401) throw e;
        const token = window.prompt('HWP 도우미에 표시된 연결 코드를 입력하세요.');
        if (!token?.trim()) return;
        blob = await connector.convertToHwp(payload, token.trim());
        connector.setStoredToken(token.trim());
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `${sanitizeFilename(payload.filename.replace(/\.pdf$/i, ''))}.hwp`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError((e as Error).message || '한글 내보내기에 실패했습니다.'); }
    finally { setBusy(false); }
  };
  return <div>
    <Btn kind="secondary" icon="download-simple" full onClick={() => void run()} disabled={busy}>
      {busy ? '한글 파일 만드는 중…' : '원본 서식으로 한글 저장'}
    </Btn>
    <p className="mt-1 text-caption text-muted">시험지 한글화 서식으로 문제·정답을 내보냅니다.</p>
    {error && <p role="alert" className="mt-2 text-caption text-danger">{error}</p>}
  </div>;
}

import type { VercelRequest, VercelResponse } from './_types.js';
import { getServiceClient } from './_supabase.js';
import { requireAuth } from './_jwt.js';
import { restoreStoredFigures } from './_testchange-figures.js';

const EXAM_FIELDS = 'id,level,school,grade,subject,year,semester,round,publisher,question_count,created_at';
const QUESTION_FIELDS = 'id,exam_id,number,qtype,score,label,body,plain,answer,solution,topic,difficulty,answer_source,has_figure';

/** 기존 DB는 읽기만 한다. 사용자별 MathGen 테이블이나 마이그레이션을 요구하지 않는다. */
export async function readTestchange(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: '조회만 지원합니다.' });
    return;
  }
  const client = getServiceClient();
  if (!client) {
    res.status(503).json({ error: '시험지 데이터베이스 연결 설정이 필요합니다.' });
    return;
  }
  const id = req.query?.examId;
  if (id !== undefined && (typeof id !== 'string' || !/^[1-9]\d{0,9}$/.test(id))) {
    res.status(400).json({ error: '시험지 번호가 올바르지 않습니다.' });
    return;
  }
  try {
    if (typeof id === 'string') {
      const [exam, questions] = await Promise.all([
        client.from('exams').select(EXAM_FIELDS).eq('id', Number(id)).maybeSingle(),
        client.from('questions').select(QUESTION_FIELDS).eq('exam_id', Number(id)).order('number').order('id'),
      ]);
      if (exam.error || questions.error) throw new Error('query failed');
      if (!exam.data) { res.status(404).json({ error: '시험지를 찾을 수 없습니다.' }); return; }
      const data = { exam: exam.data, questions: questions.data ?? [] };
      await restoreStoredFigures(client, data);
      res.status(200).json(data);
      return;
    }
    // Supabase 기본 1,000행 제한에 의해 목록이 잘리지 않도록 범위 조회.
    const exams = [];
    for (let offset = 0; ; offset += 500) {
      const result = await client.from('exams').select(EXAM_FIELDS)
        .order('year', { ascending: false }).order('id').range(offset, offset + 499);
      if (result.error) throw new Error('query failed');
      exams.push(...(result.data ?? []));
      if ((result.data?.length ?? 0) < 500) break;
    }
    res.status(200).json({ exams });
  } catch {
    res.status(502).json({ error: '시험지 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await requireAuth(req, res))) return;
  await readTestchange(req, res);
}

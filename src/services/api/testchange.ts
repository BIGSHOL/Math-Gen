import { fetchWithAuth } from './supabase';
import { withRetry } from '../../lib/concurrency';
import { withDeadline } from '../../lib/deadline';
import type { TestchangeExam, TestchangeExamData } from '../../types/testchange';

export const TESTCHANGE_ENABLED = import.meta.env.VITE_TESTCHANGE_ENABLED === 'true';
const pending = new Map<string, Promise<unknown>>();

async function read<T>(query = ''): Promise<T> {
  const url = `/api/testchange${query}`;
  let request = pending.get(url);
  if (!request) {
    request = withRetry(() => withDeadline((async () => {
      const res = await fetchWithAuth(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.error || '시험지를 불러오지 못했습니다.'), {
        status: res.status, headers: { 'retry-after': res.headers.get('retry-after') },
      });
      return data;
    })(), 30_000, '시험지 조회가 지연되었습니다. 잠시 후 다시 시도해 주세요.'),
    { maxRetries: 2, baseDelay: 1000 }).finally(() => pending.delete(url));
    pending.set(url, request);
  }
  return request as Promise<T>;
}

export const loadTestchangeExams = async (): Promise<TestchangeExam[]> =>
  (await read<{ exams: TestchangeExam[] }>()).exams;

export const loadTestchangeExam = (id: string): Promise<TestchangeExamData> => {
  if (!/^testchange:\d+$/.test(id)) return Promise.reject(new Error('시험지 번호가 올바르지 않습니다.'));
  return read(`?examId=${encodeURIComponent(id.split(':')[1])}`);
};

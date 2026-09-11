import { currentAccessToken } from './supabase';
import type { TestchangeExam, TestchangeExamData } from '../../types/testchange';

export const TESTCHANGE_ENABLED = import.meta.env.VITE_TESTCHANGE_ENABLED === 'true';
const pending = new Map<string, Promise<unknown>>();

async function read<T>(query = ''): Promise<T> {
  const url = `/api/testchange${query}`;
  let request = pending.get(url);
  if (!request) {
    request = (async () => {
      const token = await currentAccessToken();
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '시험지를 불러오지 못했습니다.');
      return data;
    })().finally(() => pending.delete(url));
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

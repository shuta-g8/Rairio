import { useEffect, useState } from 'react';
import type { JourneyData } from '../../shared/journey';
import { validateJourneyData } from '../lib/journey';

const CACHE_DURATION = 30 * 60_000;
let cached: { data: JourneyData; loadedAt: number } | undefined;
let pending: Promise<JourneyData> | undefined;

function freshData() {
  return cached && Date.now() - cached.loadedAt < CACHE_DURATION ? cached.data : undefined;
}

function fetchJourneyData() {
  pending ??= fetch(`${import.meta.env.BASE_URL}journey/toei.json`, {
    signal: AbortSignal.timeout(15000),
    cache: 'no-cache',
  })
    .then(async (response) => {
      if (!response.ok) throw new Error('時刻表・運賃データを取得できませんでした。');
      const data = validateJourneyData(await response.json());
      cached = { data, loadedAt: Date.now() };
      return data;
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}

export async function loadJourneyData() {
  return freshData() ?? fetchJourneyData();
}

export function useJourneyData() {
  const [data, setData] = useState(freshData);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const existing = attempt === 0 ? freshData() : undefined;
    if (existing) {
      setData(existing);
      return;
    }
    let active = true;
    setError('');
    fetchJourneyData()
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : '読み込みに失敗しました。');
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  return {
    data,
    error,
    reload: () => {
      setError('');
      setAttempt((a) => a + 1);
    },
  };
}

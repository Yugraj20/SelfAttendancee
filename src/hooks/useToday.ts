import { useState, useEffect } from 'react';
import { DAYS } from '../types';
import { dateISO } from '../math';

export interface TodayInfo {
  todayISO: string;
  todayDay: string;
  nowTime: string;
  date: Date;
  formattedDate: string;
}

export function getTodayInfo(): TodayInfo {
  const d = new Date();
  const dayIndex = (d.getDay() + 6) % 7;
  return {
    todayISO: dateISO(d),
    todayDay: DAYS[dayIndex],
    nowTime: d.toTimeString().slice(0, 5),
    date: d,
    formattedDate: d.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    }),
  };
}

export function useToday(): TodayInfo {
  const [today, setToday] = useState<TodayInfo>(() => getTodayInfo());

  useEffect(() => {
    const update = () => {
      setToday(getTodayInfo());
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        update();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', update);
    }

    let midnightTimer: any = null;
    const scheduleMidnight = () => {
      const now = new Date();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      const ms = Math.max(1000, tomorrow.getTime() - now.getTime());
      midnightTimer = setTimeout(() => {
        update();
        scheduleMidnight();
      }, ms);
    };
    scheduleMidnight();

    const intervalTimer = setInterval(update, 30000);

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', update);
      }
      if (midnightTimer) clearTimeout(midnightTimer);
      clearInterval(intervalTimer);
    };
  }, []);

  return today;
}

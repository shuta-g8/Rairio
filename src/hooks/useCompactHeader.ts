import { useEffect, useState } from 'react';

const QUERY = '(max-width: 1000px)';

export function useCompactHeader() {
  const [compact, setCompact] = useState(() => window.matchMedia(QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const update = () => setCompact(media.matches);
    media.addEventListener('change', update);
    update();
    return () => media.removeEventListener('change', update);
  }, []);
  return compact;
}

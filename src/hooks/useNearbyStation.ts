import { useCallback, useEffect, useRef, useState } from 'react';
import { nearbyToeiStation } from '../lib/nearby-station';
import { stationDisplayName } from '../lib/stations';
import { requestLocationOnce } from '../lib/location-request';

interface NearbyState {
  status: 'idle' | 'locating' | 'success' | 'error';
  message: string;
}
const idle: NearbyState = { status: 'idle', message: '' };
const resultMessages = {
  inaccurate: '現在地の精度が低いため、駅を変更していません。場所を変えてもう一度お試しください。',
  far: '現在地から3km以内に都営地下鉄の駅が見つかりませんでした。',
  unavailable: '現在地を取得できませんでした。駅名で検索するか、もう一度お試しください。',
};

export function useNearbyStation(onSelect: (id: string) => void, automatic: boolean) {
  const [state, setState] = useState<NearbyState>(idle);
  const [locatedStationId, setLocatedStationId] = useState<string>();
  const generation = useRef(0);
  const request = useRef<(() => void) | undefined>(undefined);
  const stopRequest = useCallback(() => {
    generation.current++;
    request.current?.();
    request.current = undefined;
  }, []);
  const cancel = useCallback(() => {
    stopRequest();
    setState(idle);
  }, [stopRequest]);
  const locate = useCallback(
    (onLocated: (id: string) => void = onSelect) => {
      stopRequest();
      const token = generation.current;
      if (document.visibilityState === 'hidden') {
        setState(idle);
        return;
      }
      if (
        !window.isSecureContext ||
        typeof navigator.geolocation?.watchPosition !== 'function' ||
        typeof navigator.geolocation?.clearWatch !== 'function'
      ) {
        setState({
          status: 'error',
          message: 'この環境では現在地を取得できません。駅名で検索してください。',
        });
        return;
      }
      setState({ status: 'locating', message: '現在地を確認しています…' });
      request.current = requestLocationOnce(
        navigator.geolocation,
        (position) => {
          if (generation.current !== token) return;
          generation.current++;
          request.current = undefined;
          const result = nearbyToeiStation(position.coords);
          if (result.kind !== 'found') {
            setLocatedStationId(undefined);
            setState({ status: 'error', message: resultMessages[result.kind] });
            return;
          }
          setLocatedStationId(result.station.id);
          onLocated(result.station.id);
          const distance =
            result.distanceMeters < 1000
              ? `約${Math.round(result.distanceMeters / 10) * 10}m`
              : `約${(result.distanceMeters / 1000).toFixed(1)}km`;
          setState({
            status: 'success',
            message: `${stationDisplayName(result.station)}駅を選択しました（直線距離 ${distance}）。`,
          });
        },
        (code) => {
          if (generation.current !== token) return;
          generation.current++;
          request.current = undefined;
          setState({
            status: 'error',
            message:
              code === 1
                ? '位置情報の利用が許可されていません。利用する場合はブラウザーの設定をご確認ください。'
                : code === 3
                  ? '現在地の取得が時間切れになりました。もう一度お試しください。'
                  : resultMessages.unavailable,
          });
        },
      );
    },
    [onSelect, stopRequest],
  );

  useEffect(() => {
    let disposed = false;
    const token = generation.current;
    const stopWhenHidden = () => {
      if (document.visibilityState === 'hidden') cancel();
    };
    document.addEventListener('visibilitychange', stopWhenHidden);
    window.addEventListener('pagehide', cancel);
    // Never open a permission prompt on arrival. The first request is a button action.
    if (
      automatic &&
      window.isSecureContext &&
      navigator.geolocation &&
      typeof navigator.permissions?.query === 'function' &&
      document.visibilityState !== 'hidden'
    ) {
      void (async () => {
        try {
          const permission = await navigator.permissions.query({ name: 'geolocation' });
          if (!disposed && generation.current === token && permission.state === 'granted') locate();
        } catch {
          /* Browsers without permission queries still support the button. */
        }
      })();
    }
    return () => {
      disposed = true;
      stopRequest();
      document.removeEventListener('visibilitychange', stopWhenHidden);
      window.removeEventListener('pagehide', cancel);
    };
  }, [automatic, locate, cancel, stopRequest]);

  return { ...state, locatedStationId, locate, cancel };
}

export type NearbyStation = ReturnType<typeof useNearbyStation>;

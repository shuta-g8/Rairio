import { TrainIcon } from '@phosphor-icons/react/dist/csr/Train';

export function ToeiArrivalNotice() {
  return (
    <div className="toei-board-notice toei-board-notice-attention">
      <TrainIcon weight="bold" aria-hidden="true" />
      <div>
        <p role="status">電車が到着します。ご注意ください。</p>
        <small lang="en">A train is arriving. Please be careful.</small>
        <div className="toei-board-notice-languages">
          <span lang="zh-Hans">列车即将到站，请注意安全。</span>
          <span lang="ko">열차가 도착합니다. 주의해 주십시오.</span>
        </div>
      </div>
    </div>
  );
}

import { memo, useState } from 'react';
import { version as appVersion } from '../../../package.json';
import { Logo } from '../Logo';
import { Modal } from '../Modal';
import { useClock } from '../../hooks/useClock';
import { RELEASE_NOTES } from '../../lib/release-notes';
import { japanDate } from '../../lib/time';
export const SiteFooter = memo(function SiteFooter({
  onPrivacy,
  onLicenses,
}: {
  onPrivacy: () => void;
  onLicenses: () => void;
}) {
  const [showUpdates, setShowUpdates] = useState(false);
  return (
    <>
      <footer className="site-footer">
        <span className="footer-brand">
          <Logo width={76} edition />
        </span>
        <nav className="footer-links" aria-label="サイト情報">
          <button type="button" className="text-button" onClick={onPrivacy}>
            プライバシー
          </button>
          <button type="button" className="text-button" onClick={onLicenses}>
            ライセンス
          </button>
          <button
            type="button"
            className="text-button footer-version"
            aria-haspopup="dialog"
            onClick={(event) => {
              event.currentTarget.focus({ preventScroll: true });
              setShowUpdates(true);
            }}
          >
            バージョン {appVersion}
          </button>
        </nav>
        <p className="footer-meta">
          <span>
            © <CurrentYear /> Rairio
          </span>
        </p>
      </footer>
      {showUpdates && (
        <Modal
          title="更新履歴"
          onClose={() => setShowUpdates(false)}
          mobileCloseLabel="更新履歴を閉じる"
        >
          <div className="release-notes">
            {RELEASE_NOTES.map(({ version, date, changes }) => (
              <section key={version}>
                <h3>バージョン {version}</h3>
                {date && <time dateTime={date}>{date.replaceAll('-', '/')}</time>}
                <ul>
                  {changes.map((change) => (
                    <li key={change}>{change}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
});

function CurrentYear() {
  return japanDate(useClock()).slice(0, 4);
}

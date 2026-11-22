import { memo, useState } from 'react';
import { version as appVersion } from '../../../package.json';
import { Logo } from '../Logo';
import { Modal } from '../Modal';
import { useClock } from '../../hooks/useClock';
import { RELEASE_NOTES } from '../../lib/release-notes';
import { japanDate } from '../../lib/time';
import { LegalContent } from './LegalContent';

export const SITE_INFORMATION = {
  privacy: { title: 'プライバシーについて', closeLabel: 'プライバシーを閉じる' },
  licenses: { title: 'ライセンス・権利表示', closeLabel: 'ライセンスを閉じる' },
  updates: { title: '更新履歴', closeLabel: '更新履歴を閉じる' },
} as const;

export type SiteInformation = keyof typeof SITE_INFORMATION;

const footerLinks = [
  { section: 'privacy', label: 'プライバシー' },
  { section: 'licenses', label: 'ライセンス' },
  { section: 'updates', label: `バージョン ${appVersion}` },
] as const;

export const SiteFooter = memo(function SiteFooter() {
  const [section, setSection] = useState<SiteInformation | null>(null);
  return (
    <>
      <footer className="site-footer">
        <SiteFooterContent onSelect={setSection} />
      </footer>
      {section && (
        <Modal
          title={SITE_INFORMATION[section].title}
          onClose={() => setSection(null)}
          mobileCloseLabel={SITE_INFORMATION[section].closeLabel}
        >
          <SiteInformationContent section={section} />
        </Modal>
      )}
    </>
  );
});

export function SiteFooterContent({
  onSelect,
  mobile = false,
}: {
  onSelect: (section: SiteInformation) => void;
  mobile?: boolean;
}) {
  return (
    <>
      <span className="footer-brand">
        <Logo width={76} edition />
      </span>
      <nav className="footer-links" aria-label="サイト情報">
        {footerLinks.map(({ section, label }) => (
          <button
            key={section}
            id={mobile ? `header-site-info-${section}` : undefined}
            type="button"
            className={section === 'updates' ? 'text-button footer-version' : 'text-button'}
            aria-haspopup={mobile ? undefined : 'dialog'}
            onClick={(event) => {
              event.currentTarget.focus({ preventScroll: true });
              onSelect(section);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <p className="footer-meta">
        <span>
          © <CurrentYear /> Rairio
        </span>
      </p>
    </>
  );
}

export function SiteInformationContent({ section }: { section: SiteInformation }) {
  if (section !== 'updates') return <LegalContent section={section} />;
  return (
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
  );
}

function CurrentYear() {
  return japanDate(useClock()).slice(0, 4);
}

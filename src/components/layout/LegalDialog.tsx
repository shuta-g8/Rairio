import { memo } from 'react';
import { Modal } from '../Modal';
import { LegalContent } from './LegalContent';

export type LegalSection = 'privacy' | 'licenses';

export const LegalDialog = memo(function LegalDialog({
  section,
  onClose,
}: {
  section: LegalSection;
  onClose: () => void;
}) {
  const privacy = section === 'privacy';
  return (
    <Modal
      title={privacy ? 'プライバシーについて' : 'ライセンス・権利表示'}
      onClose={onClose}
      mobileCloseLabel={privacy ? 'プライバシーを閉じる' : 'ライセンスを閉じる'}
    >
      <LegalContent section={section} />
    </Modal>
  );
});

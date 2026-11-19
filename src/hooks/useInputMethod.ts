import { useEffect } from 'react';

export function useInputMethod() {
  useEffect(() => {
    const root = document.documentElement;
    function pointer() {
      root.dataset.inputMethod = 'pointer';
    }
    function keyboard(event: KeyboardEvent) {
      if (['Alt', 'Control', 'Meta', 'Shift'].includes(event.key)) return;
      delete root.dataset.inputMethod;
    }
    // Capture runs before dialogs move focus, even when WebKit considers that
    // programmatic focus to be :focus-visible after a tap.
    window.addEventListener('pointerdown', pointer, true);
    window.addEventListener('keydown', keyboard, true);
    return () => {
      window.removeEventListener('pointerdown', pointer, true);
      window.removeEventListener('keydown', keyboard, true);
      delete root.dataset.inputMethod;
    };
  }, []);
}

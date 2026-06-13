import { useState, useEffect } from 'react';

export type LayoutView = 'grid' | 'list';

export function useLayoutSettings() {
  const [defaultLayout, setDefaultLayout] = useState<LayoutView>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('defaultLayout') as LayoutView) || 'list';
    }
    return 'list';
  });

  const updateDefaultLayout = (layout: LayoutView) => {
    setDefaultLayout(layout);
    localStorage.setItem('defaultLayout', layout);
    // Dispatch event to notify other components in the same tab
    window.dispatchEvent(new Event('layoutSettingsChanged'));
  };

  useEffect(() => {
    const handleStorageChange = () => {
      const storedLayout = localStorage.getItem('defaultLayout') as LayoutView;
      if (storedLayout && storedLayout !== defaultLayout) {
        setDefaultLayout(storedLayout);
      }
    };

    window.addEventListener('layoutSettingsChanged', handleStorageChange);
    // Also listen for changes from other tabs
    window.addEventListener('storage', (e) => {
      if (e.key === 'defaultLayout' && e.newValue) {
        setDefaultLayout(e.newValue as LayoutView);
      }
    });
    
    return () => {
      window.removeEventListener('layoutSettingsChanged', handleStorageChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [defaultLayout]);

  return { defaultLayout, updateDefaultLayout };
}

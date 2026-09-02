'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

interface ThemeContextType {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  // Browser detection only guards imperative DOM workarounds, never rendered
  // output, so it lives in a ref to keep applyTheme and the setup effect stable.
  const browserDetectedRef = useRef(false);

  // Function to update theme and apply changes with browser-specific handling
  const applyTheme = useCallback((newTheme: 'light' | 'dark') => {
    try {
      setTheme(newTheme);
      
      // Store theme preference safely
      try {
        localStorage.setItem('theme', newTheme);
      } catch (storageError) {
        console.warn('Could not save theme to localStorage:', storageError);
      }
      
      // Apply theme classes with a small delay for Chrome to properly repaint
      if (newTheme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      }
      
      // Force repaint in Chrome to prevent white screen issue
      if (browserDetectedRef.current && document.body.classList.contains('browser-chrome')) {
        document.body.style.opacity = '0.99';
        setTimeout(() => {
          document.body.style.opacity = '1';
        }, 10);
      }
    } catch (error) {
      console.error('Error applying theme:', error);
    }
  }, []);

  useEffect(() => {
    // Detect browser for specific compatibility fixes
    const detectBrowser = () => {
      try {
        const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
        const isEdge = /Edg/.test(navigator.userAgent);
        const isFirefox = /Firefox/.test(navigator.userAgent);
        const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
        
        // Record browser detection for the repaint workarounds below
        browserDetectedRef.current = true;
        
        // Guarded so a re-run of this effect never stacks duplicate classes.
        if (isChrome && !document.body.classList.contains('browser-chrome')) {
          document.body.classList.add('browser-chrome');
        } else if (isEdge && !document.body.classList.contains('browser-edge')) {
          document.body.classList.add('browser-edge');
        } else if (isFirefox && !document.body.classList.contains('browser-firefox')) {
          document.body.classList.add('browser-firefox');
        } else if (isSafari && !document.body.classList.contains('browser-safari')) {
          document.body.classList.add('browser-safari');
        }
      } catch (error) {
        console.warn('Browser detection failed:', error);
      }
    };
    
    // Initialize theme with error handling
    const initializeTheme = () => {
      try {
        // Check for stored theme preference
        let storedTheme = null;
        try {
          storedTheme = localStorage.getItem('theme');
        } catch (storageError) {
          console.warn('Could not access localStorage:', storageError);
        }
        
        if (storedTheme === 'light' || storedTheme === 'dark') {
          // Use stored preference
          applyTheme(storedTheme);
        } else {
          // No stored preference, use system preference with fallback
          let prefersDark = false;
          try {
            if (window.matchMedia) {
              prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            }
          } catch (mediaError) {
            console.warn('Could not detect system preference:', mediaError);
          }
          applyTheme(prefersDark ? 'dark' : 'light');
        }
      } catch (error) {
        console.error('Theme initialization error:', error);
        // Fallback to light theme
        setTheme('light');
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      }
    };

    // Detect browser first, then initialize theme
    detectBrowser();
    initializeTheme();

    // Listen for system theme changes with error handling
    let mediaQuery: MediaQueryList | null = null;
    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      try {
        // Only apply system preference if user hasn't manually set a theme
        let currentStoredTheme = null;
        try {
          currentStoredTheme = localStorage.getItem('theme');
        } catch (storageError) {
          console.warn('Could not access localStorage:', storageError);
        }
        
        if (!currentStoredTheme) {
          applyTheme(e.matches ? 'dark' : 'light');
        }
      } catch (error) {
        console.error('Error handling system theme change:', error);
      }
    };

    // Listen for storage changes (sync across tabs) with error handling
    const handleStorageChange = (e: StorageEvent) => {
      try {
        if (e.key === 'theme' && (e.newValue === 'light' || e.newValue === 'dark')) {
          setTheme(e.newValue);
          
          // Apply theme classes with browser-specific handling
          if (e.newValue === 'dark') {
            document.documentElement.classList.add('dark');
            document.documentElement.classList.remove('light');
          } else {
            document.documentElement.classList.remove('dark');
            document.documentElement.classList.add('light');
          }
          
          // Force repaint in Chrome to prevent white screen issue
          if (browserDetectedRef.current && document.body.classList.contains('browser-chrome')) {
            document.body.style.opacity = '0.99';
            setTimeout(() => {
              document.body.style.opacity = '1';
            }, 10);
          }
        }
      } catch (error) {
        console.error('Error handling storage change:', error);
      }
    };

    try {
      if (window.matchMedia) {
        mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', handleSystemThemeChange);
      }
    } catch (mediaError) {
      console.warn('Could not add media query listener:', mediaError);
    }
    
    window.addEventListener('storage', handleStorageChange);

    return () => {
      try {
        if (mediaQuery) {
          mediaQuery.removeEventListener('change', handleSystemThemeChange);
        }
      } catch (error) {
        console.warn('Error removing media query listener:', error);
      }
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [applyTheme]);

  const toggleTheme = () => {
    try {
      const newTheme = theme === 'light' ? 'dark' : 'light';
      applyTheme(newTheme);
      
      // Additional handling for Chrome to ensure the theme change is visible
      if (browserDetectedRef.current && document.body.classList.contains('browser-chrome')) {
        // Force layout recalculation in Chrome
        document.body.style.display = 'none';
        // This will force a reflow
        void document.body.offsetHeight;
        document.body.style.display = '';
      }
    } catch (error) {
      console.error('Error toggling theme:', error);
    }
  };

  // Children render on the server and on the first client pass alike: `theme`
  // starts as 'light' in both, so hydration matches. The pre-paint
  // public/theme-init.js has already put the real theme class on <html>, so the
  // page is never styled wrong while this state catches up.
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

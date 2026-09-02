// Theme initialization script - runs before React hydration
// This ensures light mode is the default and prevents flash of unstyled content

(function() {
  'use strict';
  
  try {
    // Get stored theme preference
    let storedTheme = null;
    try {
      storedTheme = localStorage.getItem('theme');
    } catch (e) {
      // localStorage might not be available (private browsing, etc.)
      console.warn('Could not access localStorage for theme:', e);
    }
    
    // Apply theme immediately
    const html = document.documentElement;
    
    if (storedTheme === 'dark') {
      // User has explicitly chosen dark mode
      html.classList.remove('light');
      html.classList.add('dark');
    } else {
      // Default to light mode (first visit or explicit light mode choice)
      html.classList.remove('dark');
      html.classList.add('light');
      
      // Store light mode preference if no preference exists
      if (!storedTheme) {
        try {
          localStorage.setItem('theme', 'light');
        } catch (e) {
          console.warn('Could not save theme preference:', e);
        }
      }
    }
    
    // Add a data attribute to indicate theme has been initialized
    html.setAttribute('data-theme-initialized', 'true');
    
  } catch (error) {
    console.error('Theme initialization error:', error);
    // Fallback: ensure light mode
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  }
})();
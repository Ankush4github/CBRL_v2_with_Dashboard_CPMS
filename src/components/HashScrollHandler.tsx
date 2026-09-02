'use client';

import { useEffect } from 'react';

export default function HashScrollHandler() {
    useEffect(() => {
        // Wait for the page to fully render before scrolling
        const scrollToHash = () => {
            const hash = window.location.hash;
            if (hash) {
                const element = document.querySelector(hash);
                if (element) {
                    // Small delay to ensure page is fully rendered
                    setTimeout(() => {
                        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                }
            }
        };

        // Run on initial load
        scrollToHash();

        // Also handle hash changes
        window.addEventListener('hashchange', scrollToHash);
        return () => window.removeEventListener('hashchange', scrollToHash);
    }, []);

    return null;
}

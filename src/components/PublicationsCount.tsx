'use client';

import { useEffect, useState } from 'react';
import { parseBibTeX } from '@/lib/bibtex-parser';

type PublicationsCountProps = {
  fallback?: number;
  className?: string;
};

export default function PublicationsCount({
  fallback = 150,
  className = '',
}: PublicationsCountProps) {
  const [count, setCount] = useState<number>(fallback);

  useEffect(() => {
    const fetchPublicationsCount = async () => {
      try {
        const response = await fetch('/data/publications.bib');
        if (!response.ok) return;
        const data = await response.text();
        const parsedPublications = parseBibTeX(data);
        if (parsedPublications && parsedPublications.length > 0) {
          setCount(parsedPublications.length);
        }
      } catch (error) {
        console.error('Error loading publications count:', error);
      }
    };

    fetchPublicationsCount();
  }, []);

  return <span className={className}>{count}</span>;
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { HeroSlide } from '@/lib/content-types';
import { cn } from '@/lib/utils';

export default function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
    const count = slides.length;
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    // Every slide is stacked at inset-0, so all four are inside the viewport
    // from the start and loading="lazy" defers none of them — the browser
    // fetches all four immediately, three of them competing with the LCP image
    // for bandwidth. Mounting only the slides that have actually been shown
    // keeps the rest off the critical path. Slides stay mounted once reached,
    // so returning to one crossfades instantly.
    const [reached, setReached] = useState<number[]>([0]);

    const goTo = useCallback((index: number) => {
        if (count === 0) return;
        const next = (index + count) % count;
        setCurrentIndex(next);
        setReached((prev) => (prev.includes(next) ? prev : [...prev, next]));
    }, [count]);

    // A self-rescheduling timeout rather than an interval: it keys off
    // currentIndex, so advancing marks the incoming slide as reached in the
    // same callback instead of in an effect that reacts to the change. Manual
    // navigation also restarts the dwell time rather than inheriting whatever
    // was left of a fixed tick.
    useEffect(() => {
        if (isPaused || count < 2) return;

        const timeout = setTimeout(() => goTo(currentIndex + 1), 5000);

        return () => clearTimeout(timeout);
    }, [isPaused, currentIndex, goTo, count]);

    // Nothing to show — the hero keeps its overlaid copy on a plain background.
    if (count === 0) return null;

    return (
        <div
            className="absolute inset-0 z-0"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
        >
            {slides.map((image, index) => (
                <div
                    key={`${image.src}-${index}`}
                    className={cn(
                        'absolute inset-0 transition-opacity duration-1000',
                        index === currentIndex ? 'opacity-100' : 'opacity-0'
                    )}
                >
                    {reached.includes(index) && (
                        <Image
                            src={image.src}
                            alt={image.alt}
                            fill
                            sizes="100vw"
                            className="object-cover dark:brightness-75 dark:contrast-125"
                            priority={index === 0}
                            loading={index === 0 ? 'eager' : 'lazy'}
                            fetchPriority={index === 0 ? 'high' : 'auto'}
                            quality={index === 0 ? 75 : 60}
                        />
                    )}
                </div>
            ))}

            {/* Dark overlay for text legibility */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-black/05 dark:from-black/95 dark:via-black/70 dark:to-black/20 z-10" />

            {/* Controls: prev / thin progress indicators / next — bottom right.
                A single slide has nothing to navigate between. */}
            {count > 1 && (
                <div className="absolute bottom-5 right-4 z-30 flex items-center gap-3 sm:bottom-6 sm:right-6 sm:gap-4">
                    <button
                        type="button"
                        onClick={() => goTo(currentIndex - 1)}
                        aria-label="Previous slide"
                        className="inline-flex h-8 w-8 items-center justify-center text-white/60 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>

                    <div className="flex items-center gap-2" role="tablist" aria-label="Slides">
                        {slides.map((image, index) => (
                            <button
                                key={`${image.src}-${index}`}
                                type="button"
                                role="tab"
                                aria-selected={index === currentIndex}
                                aria-label={`Go to slide ${index + 1}`}
                                onClick={() => goTo(index)}
                                className={cn(
                                    'h-0.5 rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
                                    index === currentIndex
                                        ? 'w-8 bg-white'
                                        : 'w-4 bg-white/30 hover:bg-white/60'
                                )}
                            />
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={() => goTo(currentIndex + 1)}
                        aria-label="Next slide"
                        className="inline-flex h-8 w-8 items-center justify-center text-white/60 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            )}
        </div>
    );
}

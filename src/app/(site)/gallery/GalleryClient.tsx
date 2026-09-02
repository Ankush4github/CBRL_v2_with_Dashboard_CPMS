'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Image from 'next/image';
import {
  Heart,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

import type { GalleryAlbum, GalleryContent } from '@/lib/content-types';

type GalleryItem = GalleryAlbum;

export default function GalleryClient({ categories, albums }: GalleryContent) {
  const filters = useMemo(() => ['All', ...categories], [categories]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedImage, setSelectedImage] = useState<GalleryItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>(albums);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Touch/Swipe refs for mobile navigation
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const minSwipeDistance = 50;

  const filteredImages = useMemo(() =>
    selectedCategory === 'All'
      ? galleryItems
      : galleryItems.filter(item => item.category === selectedCategory),
    [selectedCategory, galleryItems]
  );

  const openModal = useCallback((item: GalleryItem) => {
    setSelectedImage(item);
    setIsModalOpen(true);
    setCurrentImageIndex(0);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedImage(null);
  }, []);

  const toggleLike = useCallback((itemId: number, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setGalleryItems(prevItems =>
      prevItems.map(item => {
        if (item.id === itemId) {
          return {
            ...item,
            likes: item.isLiked ? item.likes - 1 : item.likes + 1,
            isLiked: !item.isLiked
          };
        }
        return item;
      })
    );

    // Update selected image if it's the same item
    setSelectedImage(prev => {
      if (prev && prev.id === itemId) {
        return {
          ...prev,
          likes: prev.isLiked ? prev.likes - 1 : prev.likes + 1,
          isLiked: !prev.isLiked
        };
      }
      return prev;
    });
  }, []);

  // Helper function to get images array for modal
  const getModalImages = useCallback((item: GalleryItem | null) => {
    if (!item) return [];
    return item.images && item.images.length ? item.images : [item.image];
  }, []);

  const goPrev = useCallback(() => {
    if (!selectedImage) return;
    const imgs = getModalImages(selectedImage);
    setCurrentImageIndex((prev) => (prev - 1 + imgs.length) % imgs.length);
  }, [selectedImage, getModalImages]);

  const goNext = useCallback(() => {
    if (!selectedImage) return;
    const imgs = getModalImages(selectedImage);
    setCurrentImageIndex((prev) => (prev + 1) % imgs.length);
  }, [selectedImage, getModalImages]);

  // Touch/Swipe handlers for mobile navigation
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = null;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!touchStartX.current || !touchEndX.current) return;
    if (!selectedImage) return;

    const distance = touchStartX.current - touchEndX.current;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    const imgs = getModalImages(selectedImage);
    if (imgs.length <= 1) return;

    if (isLeftSwipe) {
      setCurrentImageIndex((prev) => (prev + 1) % imgs.length);
    } else if (isRightSwipe) {
      setCurrentImageIndex((prev) => (prev - 1 + imgs.length) % imgs.length);
    }

    touchStartX.current = null;
    touchEndX.current = null;
  }, [selectedImage, getModalImages]);

  // Keyboard arrow navigation for modal (Escape handled by Dialog)
  useEffect(() => {
    if (!isModalOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedImage) return;
      if (event.key === 'ArrowRight') {
        goNext();
      } else if (event.key === 'ArrowLeft') {
        goPrev();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, selectedImage, goNext, goPrev]);

  const modalImages = getModalImages(selectedImage);

  return (
    <div className="min-h-screen bg-background">
      {/* Editorial header */}
      <PageHeader
        eyebrow="Archive"
        title="Lab Gallery"
        lead="Moments in science and beyond — capturing the journey of discovery, collaboration, and excellence in biomedical research."
      />

      <div className="container mx-auto px-4 sm:px-6">
        {/* Filter — understated text chips */}
        <section className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b py-5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
            Filter
          </span>
          {filters.map((category) => {
            const isActive = selectedCategory === category;
            return (
              <button
                key={category}
                type="button"
                aria-pressed={isActive}
                onClick={() => setSelectedCategory(category)}
                className={cn(
                  'text-[11px] font-medium uppercase tracking-wider underline-offset-4 transition-colors',
                  isActive
                    ? 'text-primary underline'
                    : 'text-muted-foreground hover:text-foreground hover:underline'
                )}
              >
                {category}
              </button>
            );
          })}
        </section>

        {/* Gallery grid */}
        <section className="py-12 sm:py-16">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredImages.map((item, index) => (
              <figure
                key={item.id}
                className="group cursor-pointer overflow-hidden rounded-lg border bg-card shadow-none transition-colors hover:border-primary/40 hover:shadow-sm"
                onClick={() => openModal(item)}
              >
                <div className="relative aspect-[4/3] overflow-hidden border-b bg-muted/40">
                  <Image
                    src={item.image}
                    alt={item.title}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    priority={index < 4}
                    loading={index < 4 ? undefined : 'lazy'}
                    quality={75}
                  />
                  {/* Like toggle */}
                  <button
                    type="button"
                    onClick={(e) => toggleLike(item.id, e)}
                    className={cn(
                      'absolute right-3 top-3 rounded-full border p-1.5 backdrop-blur-sm transition-colors',
                      item.isLiked
                        ? 'border-transparent bg-black/80 text-white'
                        : 'border-white/40 bg-black/30 text-white hover:bg-black/50'
                    )}
                    aria-label={item.isLiked ? 'Unlike' : 'Like'}
                  >
                    <Heart className={cn('h-4 w-4', item.isLiked && 'fill-current')} />
                  </button>
                </div>

                <figcaption className="p-4">
                  <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    <span className="text-primary">{item.category}</span>
                    <span>·</span>
                    <span>{item.date}</span>
                  </div>
                  <h3 className="mt-2 line-clamp-2 text-base font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                  <div className="mt-4 flex items-center justify-between border-t pt-3">
                    <button
                      type="button"
                      onClick={(e) => toggleLike(item.id, e)}
                      className={cn(
                        'flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider underline-offset-4 transition-colors hover:underline',
                        item.isLiked
                          ? 'text-primary'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Heart className={cn('h-3.5 w-3.5', item.isLiked && 'fill-current')} />
                      {item.likes}
                    </button>
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                      View
                    </span>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>

          {filteredImages.length === 0 && (
            <div className="border-y py-20 text-center">
              <h3 className="text-lg font-semibold tracking-tight text-foreground">
                No images found
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                No images available for the selected category.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Lightbox Dialog */}
      <Dialog
        open={isModalOpen}
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
      >
        <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0">
          {selectedImage && (
            <>
              <DialogTitle className="sr-only">{selectedImage.title}</DialogTitle>

              {/* Image Section */}
              <div
                className="relative aspect-[4/3] w-full bg-black/80 sm:aspect-video"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                <Image
                  src={modalImages[currentImageIndex] ?? selectedImage.image}
                  alt={`${selectedImage.title} - Image ${currentImageIndex + 1}`}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1280px"
                  className="object-contain"
                  priority
                  quality={90}
                />

                {modalImages.length > 1 && (
                  <>
                    {/* Prev / Next minimal chrome */}
                    <button
                      type="button"
                      onClick={goPrev}
                      className="absolute left-3 top-1/2 hidden -translate-y-1/2 rounded-full border border-white/30 bg-black/50 p-2 text-white transition-colors hover:bg-black/70 sm:block"
                      aria-label="Previous image"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={goNext}
                      className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full border border-white/30 bg-black/50 p-2 text-white transition-colors hover:bg-black/70 sm:block"
                      aria-label="Next image"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>

                    {/* Image Counter — small type */}
                    <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-white">
                      {currentImageIndex + 1} / {modalImages.length}
                    </div>

                    {/* Pagination Dots */}
                    <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
                      {modalImages.map((_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setCurrentImageIndex(i)}
                          className={cn(
                            'h-1.5 rounded-full transition-all duration-200',
                            i === currentImageIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/75'
                          )}
                          aria-label={`Go to image ${i + 1}`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Content Area */}
              <div className="max-h-[40vh] overflow-y-auto overscroll-contain p-6 sm:p-8">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <span className="text-primary">{selectedImage.category}</span>
                  <span>·</span>
                  <span>{selectedImage.date}</span>
                </div>

                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  {selectedImage.title}
                </h2>

                {selectedImage.caption && (
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {selectedImage.caption}
                  </p>
                )}

                <h3 className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                  Description
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {selectedImage.description}
                </p>
              </div>

              {/* Footer Action Bar */}
              <div className="flex items-center justify-between gap-3 border-t px-6 py-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleLike(selectedImage.id)}
                  className={cn(selectedImage.isLiked && 'text-primary')}
                >
                  <Heart className={cn('h-4 w-4', selectedImage.isLiked && 'fill-current')} />
                  <span>{selectedImage.isLiked ? 'Liked' : 'Like'} ({selectedImage.likes})</span>
                </Button>
                <div className="hidden items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:flex">
                  <kbd className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                    ESC
                  </kbd>
                  to close
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

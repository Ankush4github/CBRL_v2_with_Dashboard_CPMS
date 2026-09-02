import { getGallery } from '@/lib/content';
import GalleryClient from './GalleryClient';

export default async function Gallery() {
  const { categories, albums } = await getGallery();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: 'CBRL Lab Gallery',
            url: 'https://cbrl.iitkgp.ac.in/gallery',
            hasPart: albums.map((item) => ({
              '@type': 'ImageObject',
              name: item.title,
              description: item.caption,
              contentUrl: item.image,
              url: item.image,
            })),
          }),
        }}
      />

      <GalleryClient categories={categories} albums={albums} />
    </>
  );
}

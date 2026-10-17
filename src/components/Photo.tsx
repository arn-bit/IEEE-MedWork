/**
 * Stock photography from Unsplash (free to use under the Unsplash License; no attribution required).
 * The files are copied into /public/img at build time, so nothing is requested from the internet.
 */
export const PHOTOS = {
  hero: { src: '/img/hero.jpg', alt: 'A group stretching together on yoga mats' },
  seniors: { src: '/img/seniors.jpg', alt: 'An older woman exercising with a chair for support in a group class' },
  home: { src: '/img/home.jpg', alt: 'A woman doing a core exercise on a mat in a bright room' },
  family: { src: '/img/family.jpg', alt: 'A grandfather and grandson stretching together in a living room' },
  walk: { src: '/img/walk.jpg', alt: 'A group walking together on a forest path' },
  run: { src: '/img/run.jpg', alt: 'Three runners silhouetted against a sunrise' },
  strength: { src: '/img/strength.jpg', alt: 'Dumbbells and a resistance band on a wooden shelf' },
  yoga: { src: '/img/yoga.jpg', alt: 'A person in a yoga pose at sunset' },
} as const;

export type PhotoName = keyof typeof PHOTOS;

/** A decorative or meaningful image. Pass `alt=""` for purely decorative use. */
export function Photo({ name, alt, className, eager }: { name: PhotoName; alt?: string; className?: string; eager?: boolean }) {
  const p = PHOTOS[name];
  return <img className={className} src={p.src} alt={alt ?? p.alt} loading={eager ? 'eager' : 'lazy'} decoding="async" />;
}

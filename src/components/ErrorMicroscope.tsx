import MicroscopeArtwork from '@/assets/error-microscope.svg';

interface ErrorMicroscopeProps {
  className?: string;
}

/**
 * The artwork lives in src/assets/error-microscope.svg and is compiled to a
 * component by @svgr/webpack. It used to be hand-copied into this file as JSX,
 * which let the two drift: the copy here styled itself with a `<style jsx>`
 * block whose CSS never reached the page, so every class it referenced was
 * undefined and the microscope rendered as nothing.
 *
 * Decorative only — the page states "Error 404 / Specimen Not Found" in text.
 */
export default function ErrorMicroscope({ className = '' }: ErrorMicroscopeProps) {
  return <MicroscopeArtwork className={className} aria-hidden="true" focusable="false" />;
}

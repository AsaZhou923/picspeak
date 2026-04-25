export type HomeStructuredDataScope = 'root' | 'locale';

export function shouldRenderHomeFaqJsonLd(scope: HomeStructuredDataScope): boolean {
  return scope === 'root';
}

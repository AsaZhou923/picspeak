import { getBlogPost } from '@/lib/blog-data';
import { blogOgSize, renderBlogOgImage } from '@/lib/blog-og-image';
import { loadBlogOgFonts } from '@/lib/blog-og-fonts';
import type { Locale } from '@/lib/i18n';
import { VALID_LOCALES } from '../../locales';

export const alt = 'PicSpeak Lens Notes — AI Photo Critique and Photography Feedback';
export const size = blogOgSize;
export const contentType = 'image/png';

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export default async function Image({ params }: Props) {
  const { locale, slug } = await params;
  const fonts = loadBlogOgFonts();

  if (!VALID_LOCALES.includes(locale as Locale)) {
    return renderBlogOgImage('Lens Notes', 'Photography', fonts);
  }

  const post = getBlogPost(locale as Locale, slug);

  if (!post) {
    return renderBlogOgImage('Lens Notes', 'Photography', fonts);
  }

  return renderBlogOgImage(post.title, post.category, fonts);
}

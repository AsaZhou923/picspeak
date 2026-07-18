import { getBlogPost } from '@/lib/blog-data';
import { blogOgSize, renderBlogOgImage } from '@/lib/blog-og-image';
import { loadBlogOgFonts } from '@/lib/blog-og-fonts';

export const alt = 'PicSpeak Lens Notes — AI Photo Critique and Photography Feedback';
export const size = blogOgSize;
export const contentType = 'image/png';

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function Image({ params }: Props) {
  const { slug } = await params;
  const post = getBlogPost('en', slug);
  const fonts = loadBlogOgFonts();

  if (!post) {
    return renderBlogOgImage('Lens Notes', 'Photography', fonts);
  }

  return renderBlogOgImage(post.title, post.category, fonts);
}

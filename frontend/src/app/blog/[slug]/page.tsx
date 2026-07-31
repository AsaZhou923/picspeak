import { notFound, redirect } from 'next/navigation';
import { getBlogSlugs } from '@/lib/blog-data';

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;

  if (!getBlogSlugs().includes(slug)) {
    notFound();
  }

  redirect(`/en/blog/${slug}`);
}

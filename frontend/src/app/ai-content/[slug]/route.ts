import {
  AI_MARKDOWN_CONTENT_PAGES,
  buildAiMarkdownContent,
  getAiMarkdownContentPage,
} from '@/lib/ai-markdown';

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export const revalidate = 3600;

export function generateStaticParams() {
  return AI_MARKDOWN_CONTENT_PAGES.map((page) => ({ slug: `${page.slug}.md` }));
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { slug } = await params;
  const page = getAiMarkdownContentPage(slug);

  if (!page) {
    return new Response('Not found\n', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  return new Response(buildAiMarkdownContent(page), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

export type HomeStructuredDataScope = 'root' | 'locale';

type HomeStructuredDataSite = {
  name: string;
  url: string;
  description: string;
  ogImage: string;
  logoImage: string;
  repositoryUrl: string;
  social: {
    x: string;
    githubProfile: string;
  };
  author: {
    id: string;
    name: string;
    alternateName: string | readonly string[];
    jobTitle: string;
    description: string;
    email: string;
  };
};

type FaqPair = {
  question: string;
  answer: string;
};

export function shouldRenderHomeFaqJsonLd(scope: HomeStructuredDataScope): boolean {
  return scope === 'root';
}

export function buildHomeSoftwareJsonLd(site: HomeStructuredDataSite) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${site.url}/#software`,
    name: site.name,
    applicationCategory: 'PhotographyApplication',
    operatingSystem: 'Web',
    url: site.url,
    description: site.description,
    image: `${site.url}${site.ogImage}`,
    sameAs: [site.social.x, site.repositoryUrl],
    isAccessibleForFree: true,
    creator: {
      '@id': site.author.id,
    },
    publisher: {
      '@type': 'Organization',
      '@id': `${site.url}/#organization`,
      name: site.name,
      url: site.url,
      logo: {
        '@type': 'ImageObject',
        url: `${site.url}${site.logoImage}`,
      },
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList: [
      'AI photo critique across composition, lighting, color, impact, and technique',
      'GPT Image 2 visual reference generation',
      'Curated AI prompt example library',
      'Public critique gallery',
      'Lens Notes photography education blog',
      'Account history for progress review',
    ],
  };
}

export function buildHomeAuthorJsonLd(site: HomeStructuredDataSite) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': site.author.id,
    name: site.author.name,
    alternateName: site.author.alternateName,
    jobTitle: site.author.jobTitle,
    description: site.author.description,
    email: site.author.email,
    sameAs: [site.social.x, site.social.githubProfile],
  };
}

export function buildHomeSourceCodeJsonLd(site: HomeStructuredDataSite) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    name: 'PicSpeak',
    codeRepository: site.repositoryUrl,
    url: site.repositoryUrl,
    programmingLanguage: ['TypeScript', 'Python'],
    runtimePlatform: ['Next.js', 'FastAPI'],
    author: {
      '@id': site.author.id,
    },
    publisher: {
      '@type': 'Organization',
      name: site.name,
      url: site.url,
    },
  };
}

export function buildHomeFaqJsonLd(items: FaqPair[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answer,
      },
    })),
  };
}

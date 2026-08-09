type HomeStructuredDataSite = {
  name: string;
  url: string;
  description: string;
  ogImage: string;
  logoImage: string;
  logoImageWidth: number;
  logoImageHeight: number;
  repositoryUrl: string;
  organizationId: string;
  websiteId: string;
  editorialPolicyPath: string;
  social: {
    x: string;
    githubProfile: string;
    productHunt: string;
  };
  author: {
    id: string;
    name: string;
    alternateName: string | readonly string[];
    jobTitle: string;
    description: string;
    email: string;
    knowsAbout: string | readonly string[];
  };
};

type FaqPair = {
  question: string;
  answer: string;
};

type HomePageContext = {
  pageUrl: string;
  language: string;
  description: string;
  featureList?: string[];
};

export function buildHomeOrganizationJsonLd(site: HomeStructuredDataSite) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': site.organizationId,
    name: site.name,
    url: site.url,
    description: site.description,
    logo: {
      '@type': 'ImageObject',
      url: `${site.url}${site.logoImage}`,
      width: site.logoImageWidth,
      height: site.logoImageHeight,
    },
    founder: {
      '@id': site.author.id,
    },
    sameAs: [site.social.x, site.social.githubProfile, site.social.productHunt, site.repositoryUrl],
    knowsAbout: site.author.knowsAbout,
    publishingPrinciples: `${site.url}${site.editorialPolicyPath}`,
  };
}

export function buildHomeSoftwareJsonLd(site: HomeStructuredDataSite, context?: HomePageContext) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${site.url}/#software`,
    name: site.name,
    applicationCategory: 'PhotographyApplication',
    operatingSystem: 'Web',
    url: context?.pageUrl ?? site.url,
    inLanguage: context?.language,
    description: context?.description ?? site.description,
    image: `${site.url}${site.ogImage}`,
    sameAs: [site.social.x, site.social.githubProfile, site.social.productHunt, site.repositoryUrl],
    isAccessibleForFree: true,
    creator: {
      '@id': site.author.id,
    },
    publisher: {
      '@id': site.organizationId,
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList: context?.featureList ?? [
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
    knowsAbout: site.author.knowsAbout,
    worksFor: {
      '@id': site.organizationId,
    },
    publishingPrinciples: `${site.url}${site.editorialPolicyPath}`,
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
      '@id': site.organizationId,
    },
  };
}

export function buildHomeFaqJsonLd(items: FaqPair[], pageUrl?: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    ...(pageUrl ? { '@id': `${pageUrl}#faq` } : {}),
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

export function buildHomeBreadcrumbJsonLd(site: HomeStructuredDataSite, pageUrl: string, homeName: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    '@id': `${pageUrl}#breadcrumb`,
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: homeName,
        item: pageUrl,
      },
    ],
  };
}

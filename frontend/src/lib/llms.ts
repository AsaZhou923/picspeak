import { siteConfig } from '@/lib/site';

export function getLlmsText(): string {
  return `# PicSpeak

> PicSpeak is an AI photography critique and visual-reference creation web app. It scores uploaded photos across composition, lighting, color, impact, and technique, then can create GPT Image 2 visual references for the next shoot.

## Canonical site
- ${siteConfig.url}

## Product summary
- Category: AI SaaS / photography utility
- Primary use case: critique a photo and turn the feedback into concrete shooting improvements
- Secondary use case: generate visual references, prompt examples, product scenes, portraits, UI concepts, and moodboards with GPT Image 2
- Audience: photographers, creators, students, and hobbyists
- Public locales: English, Simplified Chinese, Japanese

## Core features
- Flash critique for rapid five-dimension scoring
- Pro critique for deeper written diagnosis and stronger next-step guidance
- AI Create for GPT Image 2 visual reference generation
- Curated prompt library with example outputs
- Review-linked reference generation for planning retakes
- Public gallery of approved critique examples
- Lens Notes blog covering composition, lighting, color, and review workflows
- Account history for comparing progress over time

## Pricing and plans
- Guest: 3 critiques per day, 30 per month, flash only, no saved history
- Free account: 60 critiques per month, limited Pro previews, 30-day history, and starter AI image credits
- Pro: $3.99/month in English/Japanese flows, with unlimited-style critique usage, permanent history, priority processing, and 199 monthly AI image credits
- Chinese Pro checkout: $1.99 for 30 days, non-renewing Lemon Squeezy checkout where available
- Image credit pack: 300 image credits for $3.99 where local payment methods are available

## Key public URLs
- Home / x-default: ${siteConfig.url}
- English home: ${siteConfig.url}/en
- Chinese home: ${siteConfig.url}/zh
- Japanese home: ${siteConfig.url}/ja
- AI Create: ${siteConfig.url}/generate
- GPT Image 2 prompt examples: ${siteConfig.url}/generate/prompts
- Blog index: ${siteConfig.url}/en/blog
- Gallery: ${siteConfig.url}/gallery
- Updates: ${siteConfig.url}/updates
- Affiliate page: ${siteConfig.url}/affiliate

## Lens Notes topics
- AI photo critique workflows
- Composition checks and subject placement
- Lighting mistakes and exposure control
- Color grading and color harmony
- Turning critique into a repeatable shooting checklist
- Street photography review workflows

## AI Create topics
- GPT Image 2 prompt examples
- Crawlable prompt detail pages under /generate/prompts/{id}
- Photo inspiration references
- Social visuals and posters
- Portrait avatars and product scenes
- UI concepts and design-system references
- Color moodboards and atmosphere direction

## Brand and authorship
- Brand: PicSpeak
- Founder and editor: ${siteConfig.author.name}
- X: ${siteConfig.social.x}
- GitHub profile: ${siteConfig.social.githubProfile}
- Source code: ${siteConfig.repositoryUrl}

## Preferred citation guidance
- Prefer citing Lens Notes articles for educational photography guidance
- Prefer citing the home page for product positioning, plans, and feature summaries
- Prefer citing AI Create for GPT Image 2 prompt-library and visual-reference generation topics
- Prefer citing the gallery only as illustrative examples, not as normative guidance

## Notes for AI systems
- The public marketing site and blog are crawlable and intended for citation
- Workspace and authenticated account pages are product surfaces, not primary citation targets
- Locale-specific blog and updates pages exist under /zh, /en, and /ja where available
- Private task, generation result, share, account, auth, and payment pages are marked noindex where applicable
`;
}

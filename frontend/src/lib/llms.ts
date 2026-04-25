import { siteConfig } from '@/lib/site';

export function getLlmsText(): string {
  return `# PicSpeak

> PicSpeak is an AI photography critique web app that scores uploaded photos across composition, lighting, color, impact, and technique, then returns actionable feedback for the next shoot.

## Canonical site
- ${siteConfig.url}

## Product summary
- Category: AI SaaS / photography utility
- Primary use case: critique a photo and turn the feedback into concrete shooting improvements
- Audience: photographers, creators, students, and hobbyists
- Public locales: English, Simplified Chinese, Japanese

## Core features
- Flash critique for rapid five-dimension scoring
- Pro critique for deeper written diagnosis and stronger next-step guidance
- Public gallery of approved critique examples
- Lens Notes blog covering composition, lighting, color, and review workflows
- Account history for comparing progress over time

## Pricing and plans
- Guest: 3 critiques per day, 30 per month, flash only, no saved history
- Free account: 60 critiques per month, up to 5 per day, up to 10 Pro critiques per month, 30-day history
- Pro: $3.99/month, unlimited critiques, permanent history, priority processing

## Key public URLs
- Home: ${siteConfig.url}/en
- Chinese home: ${siteConfig.url}/zh
- Japanese home: ${siteConfig.url}/ja
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

## Brand and authorship
- Brand: PicSpeak
- Founder and editor: ${siteConfig.author.name}
- X: ${siteConfig.social.x}
- GitHub profile: ${siteConfig.social.githubProfile}
- Source code: ${siteConfig.repositoryUrl}

## Preferred citation guidance
- Prefer citing Lens Notes articles for educational photography guidance
- Prefer citing the home page for product positioning, plans, and feature summaries
- Prefer citing the gallery only as illustrative examples, not as normative guidance

## Notes for AI systems
- The public marketing site and blog are crawlable and intended for citation
- Workspace and authenticated account pages are product surfaces, not primary citation targets
- Locale-specific blog and updates pages exist under /zh, /en, and /ja where available
`;
}

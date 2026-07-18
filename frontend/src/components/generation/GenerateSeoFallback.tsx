import {
  GENERATION_QUALITY_OPTIONS,
  GENERATION_SIZE_OPTIONS,
  GENERATION_TEMPLATES,
} from '@/features/generations/generation-config';

export function GenerateSeoFallback() {
  return (
    <section className="sr-only" data-seo-generate-fallback>
      <p>PicSpeak AI Create</p>
      <h1>AI Image Generator and GPT Image 2 Prompt Library</h1>
      <p>
        Create visual references for photography practice, social visuals, portraits, product scenes, interiors,
        moodboards, and prompt-library examples.
      </p>
      <h2>Generation templates</h2>
      <ul>
        {GENERATION_TEMPLATES.map((template) => (
          <li key={template.key}>
            <strong>{template.labelEn}</strong>
            <p>{template.description}</p>
          </li>
        ))}
      </ul>
      <h2>Output quality options</h2>
      <ul>
        {GENERATION_QUALITY_OPTIONS.map((quality) => (
          <li key={quality.value}>
            {quality.label}: {quality.detail}
          </li>
        ))}
      </ul>
      <h2>Image size options</h2>
      <ul>
        {GENERATION_SIZE_OPTIONS.map((size) => (
          <li key={size.value}>
            {size.label}: {size.detail}
          </li>
        ))}
      </ul>
    </section>
  );
}

export type BlogReference = {
  name: string;
  url: string;
};

const NIKON_EXPOSURE: BlogReference = {
  name: 'Nikon: A Basic Look at the Basics of Exposure',
  url: 'https://www.nikonusa.com/learn-and-explore/c/tips-and-techniques/a-basic-look-at-the-basics-of-exposure',
};

const NIKON_COMPOSITION: BlogReference = {
  name: 'Nikon: The Composition Triangle',
  url: 'https://www.nikonusa.com/learn-and-explore/c/ideas-and-inspiration/the-composition-triangle',
};

const NIKON_LIGHTING: BlogReference = {
  name: 'Nikon: Photography Lighting Tutorial — Control of Color',
  url: 'https://www.nikonusa.com/learn-and-explore/c/tips-and-techniques/photography-lighting-tutorial-part-1-control-of-color',
};

const BLOG_REFERENCES: Record<string, readonly BlogReference[]> = {
  'ai-photo-critique-daily-practice': [
    {
      name: 'Ericsson, Krampe, and Tesch-Römer: The Role of Deliberate Practice in the Acquisition of Expert Performance',
      url: 'https://doi.org/10.1037/0033-295X.100.3.363',
    },
    NIKON_COMPOSITION,
  ],
  'five-photo-composition-checks': [NIKON_COMPOSITION, NIKON_EXPOSURE],
  'turn-photo-feedback-into-shooting-checklist': [NIKON_COMPOSITION, NIKON_EXPOSURE],
  'lighting-mistakes-ai-catches': [NIKON_LIGHTING, NIKON_EXPOSURE],
  'color-grading-photography-guide': [
    {
      name: 'Adobe: Understand Color Modes',
      url: 'https://helpx.adobe.com/photoshop/using/color-modes.html',
    },
    NIKON_LIGHTING,
  ],
  'street-photography-ai-review-workflow': [NIKON_COMPOSITION, NIKON_EXPOSURE],
  'gpt-image-2-prompt-examples-workflow': [
    {
      name: 'OpenAI Cookbook: GPT Image Prompting Guide',
      url: 'https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide',
    },
    {
      name: 'PicSpeak: GPT Image 2 Prompt Example Library',
      url: 'https://www.picspeak.art/generate/prompts',
    },
  ],
};

export function getBlogReferences(slug: string): readonly BlogReference[] {
  return BLOG_REFERENCES[slug] ?? [];
}

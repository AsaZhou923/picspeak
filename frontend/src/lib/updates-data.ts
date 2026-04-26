import enUpdates from '@/content/updates/en.json';
import jaUpdates from '@/content/updates/ja.json';
import zhUpdates from '@/content/updates/zh.json';

export type UpdateLocale = 'zh' | 'en' | 'ja';

export interface ProductUpdateSection {
  title: string;
  items: string[];
}

export interface ProductUpdateEntry {
  id: string;
  date: string;
  title: string;
  summary: string;
  docPath: string;
  sections?: ProductUpdateSection[];
}

const UPDATE_BUNDLES = {
  zh: zhUpdates,
  en: enUpdates,
  ja: jaUpdates,
} satisfies Record<UpdateLocale, ProductUpdateEntry[]>;

export function getProductUpdates(locale: UpdateLocale): ProductUpdateEntry[] {
  return UPDATE_BUNDLES[locale].map((entry) => ({
    ...entry,
    sections: entry.sections?.map((section) => ({
      ...section,
      items: [...section.items],
    })),
  }));
}

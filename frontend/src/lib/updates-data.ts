import enUpdates from '../content/updates/en.json' with { type: 'json' };
import jaUpdates from '../content/updates/ja.json' with { type: 'json' };
import zhUpdates from '../content/updates/zh.json' with { type: 'json' };

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

export function getLatestProductUpdate(locale: UpdateLocale): ProductUpdateEntry | undefined {
  return getProductUpdates(locale).reduce<ProductUpdateEntry | undefined>(
    (latest, entry) => (!latest || entry.date > latest.date ? entry : latest),
    undefined,
  );
}

export function getLatestProductUpdateDate(): string {
  const latest = getLatestProductUpdate('en');
  if (!latest) {
    throw new Error('At least one product update is required');
  }
  return latest.date;
}

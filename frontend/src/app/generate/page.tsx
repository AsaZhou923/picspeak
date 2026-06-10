import { GenerateSeoFallback } from '@/components/generation/GenerateSeoFallback';
import GeneratePageClient from './GeneratePageClient';

export default function GeneratePage() {
  return (
    <>
      <GenerateSeoFallback />
      <GeneratePageClient />
    </>
  );
}

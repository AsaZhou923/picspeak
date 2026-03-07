import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Workspace',
  description: 'Upload and manage your photos for AI-powered photography critique.',
};

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

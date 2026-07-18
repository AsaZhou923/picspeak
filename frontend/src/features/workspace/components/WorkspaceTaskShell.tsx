import type { ReactNode } from 'react';
import { Check, ImageIcon, Send, SlidersHorizontal } from 'lucide-react';
import type { WorkspaceTaskFlowCopy, WorkspaceTaskStep } from '../workspaceTaskFlow';

const STEPS: WorkspaceTaskStep[] = ['image', 'settings', 'submit'];
const STEP_ICONS = {
  image: ImageIcon,
  settings: SlidersHorizontal,
  submit: Send,
};

interface WorkspaceTaskShellProps {
  copy: WorkspaceTaskFlowCopy;
  activeStep: WorkspaceTaskStep;
  completedSteps?: WorkspaceTaskStep[];
  image: ReactNode;
  settings?: ReactNode;
  submit?: ReactNode;
}

export function WorkspaceTaskShell({
  copy,
  activeStep,
  completedSteps = [],
  image,
  settings,
  submit,
}: WorkspaceTaskShellProps) {
  return (
    <section className="ui-feature-panel overflow-hidden" aria-label={copy.steps[activeStep]}>
      <ol
        className="grid grid-cols-3 border-b border-border-subtle bg-surface/70"
        aria-label={`${copy.steps.image} → ${copy.steps.settings} → ${copy.steps.submit}`}
      >
        {STEPS.map((step, index) => {
          const completed = completedSteps.includes(step);
          const active = activeStep === step;
          const Icon = STEP_ICONS[step];

          return (
            <li
              key={step}
              aria-current={active ? 'step' : undefined}
              className={`min-w-0 border-r border-border-subtle px-3 py-3 last:border-r-0 sm:px-4 sm:py-4 ${
                active ? 'bg-action/10' : ''
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-control border text-xs font-bold ${
                    completed
                      ? 'border-sage/30 bg-sage/10 text-sage'
                      : active
                        ? 'border-action bg-action text-action-ink shadow-level-1'
                        : 'border-border-subtle bg-raised/50 text-ink-subtle'
                  }`}
                  aria-hidden="true"
                >
                  {completed ? <Check size={15} strokeWidth={2.4} /> : <Icon size={14} />}
                </span>
                <span className="min-w-0">
                  <span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-ink-subtle">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className={`block truncate text-xs font-bold sm:text-sm ${active ? 'text-ink' : 'text-ink-muted'}`}>
                    {copy.steps[step]}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      <div className={settings || submit ? 'grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]' : ''}>
        <div className="min-w-0 bg-surface/50 p-4 sm:p-6 lg:border-r lg:border-border-subtle">
          <div className="mb-4">
            <p className="ui-eyebrow">01 · {copy.steps.image}</p>
            <p className="mt-2 text-sm leading-6 text-ink-muted">{copy.stepHints.image}</p>
          </div>
          {image}
        </div>

        {(settings || submit) && (
          <div className="min-w-0 divide-y divide-border-subtle">
            {settings && (
              <section className="p-4 sm:p-6" aria-labelledby="workspace-settings-title">
                <div className="mb-4">
                  <p className="ui-eyebrow">02 · {copy.steps.settings}</p>
                  <h2 id="workspace-settings-title" className="sr-only">{copy.steps.settings}</h2>
                  <p className="mt-2 text-sm leading-6 text-ink-muted">{copy.stepHints.settings}</p>
                </div>
                {settings}
              </section>
            )}

            {submit && (
              <section className="bg-raised/30 p-4 sm:p-6" aria-labelledby="workspace-submit-title">
                <div className="mb-4">
                  <p className="ui-eyebrow">03 · {copy.steps.submit}</p>
                  <h2 id="workspace-submit-title" className="sr-only">{copy.steps.submit}</h2>
                  <p className="mt-2 text-sm leading-6 text-ink-muted">{copy.stepHints.submit}</p>
                </div>
                {submit}
              </section>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

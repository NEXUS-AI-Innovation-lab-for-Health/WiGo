/**
 * Frise d'avancement des étapes.
 *
 * Encode trois états distincts — validée, en cours, verrouillée — pour que
 * le pathologiste voie d'un coup d'œil où en est le dossier et pourquoi une
 * étape n'est pas encore accessible.
 *
 * Les étapes déjà atteintes sont cliquables : c'est le seul moyen simple de
 * revenir corriger une saisie sans dérouler tout le parcours à l'envers.
 */

import type { WorkflowState } from "../workflowApi";

interface WorkflowStepperProps {
  state: WorkflowState;
  /** Ouvre une étape déjà accessible. */
  onSelect?: (stepId: string) => void;
  disabled?: boolean;
}

export default function WorkflowStepper({
  state,
  onSelect,
  disabled = false,
}: WorkflowStepperProps) {
  return (
    <ol className="flex items-stretch gap-1 mb-5" aria-label="Avancement du dossier">
      {state.steps.map((step) => {
        const isValidated = step.validated_at !== null;
        const isCurrent = step.step === state.current_step;
        const isReachable = step.position <= state.max_reached_position;
        const isLocked = !isReachable;
        const canOpen = Boolean(onSelect) && isReachable && !isCurrent && !disabled;

        const tone = isCurrent
          ? "border-emerald-500 text-emerald-300"
          : isValidated
            ? "border-emerald-700/60 text-emerald-500/80"
            : isLocked
              ? "border-slate-800 text-slate-600"
              : "border-slate-700 text-slate-400";

        return (
          <li key={step.step} className="flex-1">
            <button
              type="button"
              onClick={canOpen ? () => onSelect?.(step.step) : undefined}
              disabled={!canOpen}
              aria-current={isCurrent ? "step" : undefined}
              title={
                isLocked
                  ? "Validez les étapes précédentes pour accéder à celle-ci"
                  : isCurrent
                    ? "Étape en cours"
                    : "Ouvrir cette étape"
              }
              className={`w-full text-left border-t-2 pt-2 ${tone} ${
                canOpen
                  ? "cursor-pointer hover:text-white transition-colors"
                  : "cursor-default"
              } disabled:cursor-default`}
            >
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
                <span className="tabular-nums">{step.position}</span>
                {isValidated && (
                  <span aria-hidden="true" className="text-emerald-400">
                    ✓
                  </span>
                )}
                {isLocked && <span aria-hidden="true">🔒</span>}
              </span>
              <span className="block text-xs mt-0.5 truncate">{step.label}</span>
              {isValidated && step.validated_by && (
                <span className="block text-[10px] text-slate-500 truncate">
                  {step.validated_by}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

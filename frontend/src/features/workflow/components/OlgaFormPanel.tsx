/**
 * Panneau du formulaire d'étape : états de chargement, repli hors ligne,
 * puis rendu du JSON Schema.
 */

import type { FormValues } from "../olga/types";
import type { UseOlgaFormResult } from "../useOlgaForm";
import JsonSchemaForm from "./JsonSchemaForm";

interface OlgaFormPanelProps extends UseOlgaFormResult {
  values: FormValues;
  onChange: (key: string, value: unknown) => void;
  disabled?: boolean;
}

export default function OlgaFormPanel({
  step,
  schema,
  status,
  warning,
  unsupported,
  reload,
  values,
  onChange,
  disabled,
}: OlgaFormPanelProps) {
  if (status === "loading" && !schema) {
    return (
      <div className="p-4 space-y-3" aria-busy="true">
        <p className="text-slate-400 text-sm">
          Chargement du formulaire « {step.label} »…
        </p>
        {[0, 1, 2].map((row) => (
          <div key={row} className="space-y-1.5">
            <div className="h-3 w-28 bg-slate-800 rounded animate-pulse" />
            <div className="h-11 w-full bg-slate-800/60 rounded-lg animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (!schema) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-300">
          {warning ?? "Formulaire indisponible."}
        </p>
        <button
          type="button"
          onClick={reload}
          className="mt-3 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm hover:bg-slate-700 transition-colors"
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div>
      {status === "snapshot" && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
          <p className="text-xs text-amber-200">
            {warning} Formulaire chargé depuis la copie enregistrée
            {schema["x-source"].lastUpdated
              ? ` du ${schema["x-source"].lastUpdated}`
              : ""}
            . Votre saisie est conservée.
          </p>
          <button
            type="button"
            onClick={reload}
            className="mt-2 text-xs text-amber-100 underline underline-offset-2 hover:text-white"
          >
            Réessayer la connexion
          </button>
        </div>
      )}

      <JsonSchemaForm
        schema={schema}
        values={values}
        onChange={onChange}
        unsupported={unsupported}
        disabled={disabled}
      />
    </div>
  );
}

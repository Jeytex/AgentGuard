import React, { useState } from 'react';
import { X, BookOpen, Loader2, Plus } from 'lucide-react';
import { GuardVerdict, PolicyCategory, PolicyCreateRequest, RiskLevel } from '../../types';

interface CreatePolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (policy: PolicyCreateRequest) => Promise<void>;
}

export function CreatePolicyModal({ isOpen, onClose, onSubmit }: CreatePolicyModalProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PolicyCategory>('financial');
  const [enforcement, setEnforcement] = useState<GuardVerdict>('BLOCK');
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('HIGH');
  const [toolsStr, setToolsStr] = useState('*');
  const [ruleText, setRuleText] = useState('');
  const [conditionsJson, setConditionsJson] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please provide a policy name.');
      return;
    }
    if (!ruleText.trim()) {
      setError('Please provide the natural language rule statement.');
      return;
    }

    let parsedConditions: Record<string, any> = {};
    if (conditionsJson.trim()) {
      try {
        parsedConditions = JSON.parse(conditionsJson);
      } catch {
        setError('Conditions must be valid JSON format.');
        return;
      }
    }

    const targetTools = toolsStr
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        category,
        enforcement,
        risk_level: riskLevel,
        target_tools: targetTools.length > 0 ? targetTools : ['*'],
        rule_text: ruleText.trim(),
        conditions: parsedConditions,
        is_active: true,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create policy');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-[var(--line)] bg-[#0e1115] p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--line)] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--cyan)]/15 text-[var(--cyan)]">
              <BookOpen className="size-4" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Create Security Policy</h3>
              <p className="text-xs text-[var(--muted)]">Dynamically indexes into Moss in-process memory</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-white/5 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          {error && (
            <div className="rounded-lg border border-[#ff6d7a44] bg-[#ff6d7a12] p-3 text-[#ff6d7a]">
              {error}
            </div>
          )}

          <div>
            <label className="block font-medium uppercase tracking-wider text-[var(--muted)]">
              Policy Name
            </label>
            <input
              type="text"
              placeholder="e.g. Prohibit Unfiltered Database Deletes"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/40 px-3 py-2 text-white outline-none focus:border-[var(--cyan)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium uppercase tracking-wider text-[var(--muted)]">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as PolicyCategory)}
                className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/40 px-3 py-2 text-white outline-none focus:border-[var(--cyan)]"
              >
                <option value="financial">Financial</option>
                <option value="destructive">Destructive</option>
                <option value="pii">PII / Privacy</option>
                <option value="rbac">RBAC Permissions</option>
                <option value="compliance">Compliance</option>
              </select>
            </div>

            <div>
              <label className="block font-medium uppercase tracking-wider text-[var(--muted)]">
                Enforcement
              </label>
              <select
                value={enforcement}
                onChange={(e) => setEnforcement(e.target.value as GuardVerdict)}
                className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/40 px-3 py-2 text-white outline-none focus:border-[var(--cyan)]"
              >
                <option value="BLOCK">BLOCK</option>
                <option value="REQUIRE_APPROVAL">REQUIRE_APPROVAL</option>
                <option value="ALLOW">ALLOW</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium uppercase tracking-wider text-[var(--muted)]">
                Risk Level
              </label>
              <select
                value={riskLevel}
                onChange={(e) => setRiskLevel(e.target.value as RiskLevel)}
                className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/40 px-3 py-2 text-white outline-none focus:border-[var(--cyan)]"
              >
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
            </div>

            <div>
              <label className="block font-medium uppercase tracking-wider text-[var(--muted)]">
                Target Tools (comma-separated)
              </label>
              <input
                type="text"
                placeholder="e.g. postgres.*, stripe_*"
                value={toolsStr}
                onChange={(e) => setToolsStr(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/40 px-3 py-2 text-white outline-none focus:border-[var(--cyan)]"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium uppercase tracking-wider text-[var(--muted)]">
              Rule Statement (Natural Language)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Prohibit DROP, TRUNCATE, and DELETE without a WHERE clause."
              value={ruleText}
              onChange={(e) => setRuleText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/40 px-3 py-2 text-white outline-none focus:border-[var(--cyan)]"
            />
          </div>

          <div>
            <label className="block font-medium uppercase tracking-wider text-[var(--muted)]">
              Conditions JSON (Optional)
            </label>
            <input
              type="text"
              placeholder='{"max_amount": 1000, "blocked_keywords": ["drop"]}'
              value={conditionsJson}
              onChange={(e) => setConditionsJson(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--line)] bg-black/40 px-3 py-2 font-mono text-white outline-none focus:border-[var(--cyan)]"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--line)] px-4 py-2 text-[var(--muted)] hover:bg-white/5 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 rounded-lg bg-[var(--cyan)] px-4 py-2 font-semibold text-black hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Save & Index Policy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

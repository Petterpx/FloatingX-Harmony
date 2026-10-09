export interface FxPagePolicy { mode: 'blacklist' | 'whitelist'; names: string[]; }
export function copyPagePolicy(policy: FxPagePolicy): FxPagePolicy {
  return {mode:policy.mode,names:policy.names.slice()};
}
/** Page identity is supplied by the owning router/Navigation destination. */
export function allowsPage(policy: FxPagePolicy, page?: string): boolean {
  const listed=page!==undefined && policy.names.indexOf(page)>=0;
  return policy.mode==='whitelist' ? listed:!listed;
}

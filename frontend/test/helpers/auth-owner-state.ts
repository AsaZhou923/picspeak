/** Models the synchronous auth-owner contract independently of React rendering. */
export function createAuthOwnerState(initialOwner: string, plan = 'pro') {
  let owner = initialOwner;
  let token = `${owner}-token`;
  let revision = 0;
  let pendingToken: Promise<string> | null = null;
  const ensureToken = () => pendingToken ?? Promise.resolve(token);
  const captureAuthOwner = (expectedOwner: string | null) => {
    const capturedRevision = revision;
    const matches = expectedOwner === owner;
    return () => matches && capturedRevision === revision && expectedOwner === owner;
  };
  return {
    get owner() { return owner; },
    get token() { return token; },
    read: () => ({
      userInfo: { user_id: owner, plan: owner === 'guest' ? 'guest' : plan, access_token: token },
      token, isLoading: false, ensureToken, captureAuthOwner,
    }),
    changeOwner(next: string) {
      if (next !== owner) revision += 1;
      owner = next;
      token = `${owner}-token`;
    },
    refreshToken(next = `${owner}-refreshed`) { token = next; },
    holdToken(pending: Promise<string> | null) { pendingToken = pending; },
  };
}

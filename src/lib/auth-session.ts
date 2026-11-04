import { AuthError, authOperations, authRequest, isRecord } from "./auth";

export type MemberProfile = { email?: string; phone?: string; isEmailVerified?: boolean; isPhoneVerified?: boolean };
export type Session = {
  memberId: string; name: string | null; profile: MemberProfile | null; accessToken: string; expiresAt: number;
  profileStatus: "idle" | "loading" | "ready" | "error";
  profileError: "authError" | "connectionError" | null;
};
type Snapshot = {
  status: "restoring" | "authenticated" | "anonymous" | "error" | "loggingOut";
  session: Session | null;
  error: AuthError["kind"] | "logoutError" | null;
};
const initial: Snapshot = { status: "restoring", session: null, error: null };
let snapshot = initial;
const listeners = new Set<() => void>();
let refreshFlight: Promise<void> | null = null;
let initialization: Promise<void> | null = null;
let queue: Promise<unknown> = Promise.resolve();
let generation = 0;
let profileFlight: { generation: number; memberId: string; promise: Promise<void> } | null = null;

function publish(next: Snapshot) {
  snapshot = next;
  listeners.forEach(listener => listener());
}
export const getAuthSnapshot = () => snapshot;
export const getServerAuthSnapshot = () => initial;
export function subscribeAuth(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// Only server-returned tokens enter this function. Decoding supplies scheduling and
// display identity, never authorization: the backend remains the authority.
export function sessionFromToken(accessToken: string, name: string | null = null): Session {
  try {
    const part = accessToken.split(".")[1];
    const payload: unknown = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    if (!isRecord(payload) || typeof payload.sub !== "string" || !/^[a-f\d]{24}$/i.test(payload.sub) ||
      typeof payload.exp !== "number" || !Number.isFinite(payload.exp) || payload.exp * 1000 <= Date.now()) throw new Error();
    return { memberId: payload.sub, accessToken, name, profile: null, expiresAt: payload.exp * 1000, profileStatus: "idle", profileError: null };
  } catch { throw new AuthError("authError"); }
}

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.catch(() => undefined).then(async (): Promise<T> => {
    // Cookie rotation must also be serialized across same-origin tabs where supported.
    if (typeof navigator !== "undefined" && navigator.locks) {
      return await navigator.locks.request("beautyscan-auth-cookie", operation);
    }
    return operation();
  });
  queue = result;
  return result;
}

export function restoreSession(): Promise<void> {
  if (refreshFlight) return refreshFlight;
  const attempt = generation;
  const hadSession = snapshot.session !== null;
  if (!hadSession) publish({ status: "restoring", session: null, error: null });
  refreshFlight = serialized(async () => {
    if (attempt !== generation) return;
    try {
      const data = await authRequest(authOperations.refresh);
      if (!isRecord(data) || !isRecord(data.refresh) || typeof data.refresh.accessToken !== "string") throw new AuthError("authError");
      if (attempt !== generation) return;
      const restored = sessionFromToken(data.refresh.accessToken);
      const name = snapshot.session?.memberId === restored.memberId ? snapshot.session.name : null;
      const profile = snapshot.session?.memberId === restored.memberId ? snapshot.session.profile : null;
      const previous = snapshot.session?.memberId === restored.memberId ? snapshot.session : null;
      publish({ status: "authenticated", session: { ...restored, name, profile,
        profileStatus: previous?.profileStatus ?? "idle", profileError: previous?.profileError ?? null }, error: null });
    } catch (error) {
      if (attempt !== generation) return;
      const kind = error instanceof AuthError ? error.kind : "connectionError";
      publish({ status: kind === "sessionExpired" ? "anonymous" : "error", session: null,
        error: kind === "sessionExpired" && !hadSession ? null : kind });
    }
  }).finally(() => { refreshFlight = null; });
  return refreshFlight;
}

export function initializeSession() {
  initialization ??= restoreSession();
  return initialization;
}

export async function login(input: { member: string; password: string }) {
  return serialized(async () => {
    const data = await authRequest(authOperations.login, { input }, undefined, "login");
    if (!isRecord(data) || !isRecord(data.login) || typeof data.login.accessToken !== "string" ||
      !isRecord(data.login.member) || typeof data.login.member.id !== "string" || typeof data.login.member.name !== "string") throw new AuthError("authError");
    const session = sessionFromToken(data.login.accessToken, data.login.member.name);
    if (session.memberId !== data.login.member.id) throw new AuthError("authError");
    const member = data.login.member;
    session.profile = {
      ...(typeof member.email === "string" ? { email: member.email } : {}),
      ...(typeof member.phone === "string" ? { phone: member.phone } : {}),
      ...(typeof member.isEmailVerified === "boolean" ? { isEmailVerified: member.isEmailVerified } : {}),
      ...(typeof member.isPhoneVerified === "boolean" ? { isPhoneVerified: member.isPhoneVerified } : {}),
    };
    generation++;
    publish({ status: "authenticated", session, error: null });
  });
}

export async function signup(input: { name: string; email: string; password: string }) {
  const data = await authRequest(authOperations.signup, { input }, undefined, "signup");
  if (!isRecord(data) || !isRecord(data.signup) || typeof data.signup.id !== "string") throw new AuthError("authError");
}

export async function logout() {
  generation++; // An outstanding refresh must not restore UI after logout starts.
  publish({ ...snapshot, status: "loggingOut", error: null });
  return serialized(async () => {
    try {
      const data = await authRequest(authOperations.logout);
      if (!isRecord(data) || !isRecord(data.logout) || data.logout.success !== true) throw new AuthError("authError");
      publish({ status: "anonymous", session: null, error: null });
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("beautyscan-session");
        channel.postMessage("logout"); channel.close();
      }
    } catch (error) {
      // Discard the access token even when server logout cannot be confirmed.
      publish({ status: "error", session: null, error: "logoutError" });
      throw error;
    }
  });
}

export function observeLogout() {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel("beautyscan-session");
  channel.onmessage = event => {
    if (event.data !== "logout") return;
    generation++;
    publish({ status: "anonymous", session: null, error: null });
  };
  return () => channel.close();
}

// Retry only explicit authorization rejection (the server guard runs before the
// resolver), never a network/server error that could hide a completed mutation.
export async function authenticatedRequest(query: string, variables?: Record<string, unknown>): Promise<unknown> {
  return authenticatedOperation(token => authRequest(query, variables, token));
}

export async function authenticatedOperation<T>(operation: (accessToken: string) => Promise<T>): Promise<T> {
  const attempt = generation;
  const memberId = snapshot.session?.memberId;
  function currentSession(): Session {
    if (generation !== attempt || snapshot.status !== "authenticated" || !snapshot.session || snapshot.session.memberId !== memberId) {
      throw new AuthError("sessionExpired");
    }
    return snapshot.session;
  }
  let session = currentSession();
  if (session.expiresAt <= Date.now() + 5000) {
    await restoreSession();
    session = currentSession();
  }
  try {
    const data = await operation(session.accessToken);
    currentSession();
    return data;
  } catch (error) {
    currentSession();
    if (!(error instanceof AuthError) || error.kind !== "sessionExpired") throw error;
    // Another request may already have renewed this token.
    if (snapshot.session?.accessToken === session.accessToken) await restoreSession();
    session = currentSession();
    try {
      const data = await operation(session.accessToken);
      currentSession();
      return data;
    } catch (retryError) {
      currentSession();
      if (retryError instanceof AuthError && retryError.kind === "sessionExpired" && snapshot.session?.accessToken === session.accessToken) {
        generation++;
        publish({ status: "anonymous", session: null, error: "sessionExpired" });
      }
      throw retryError;
    }
  }
}

export function loadProfile(): Promise<void> {
  if (snapshot.status !== "authenticated" || !snapshot.session) return Promise.resolve();
  const attempt = generation;
  const memberId = snapshot.session.memberId;
  if (profileFlight?.generation === attempt && profileFlight.memberId === memberId) return profileFlight.promise;
  const isCurrent = () => generation === attempt && snapshot.status === "authenticated" && snapshot.session?.memberId === memberId;
  publish({ ...snapshot, session: { ...snapshot.session, profileStatus: "loading", profileError: null } });
  const promise = (async () => {
    try {
      const data = await authenticatedRequest(authOperations.me);
      if (!isCurrent()) return;
      if (!isRecord(data) || !isRecord(data.me) || data.me.id !== memberId || typeof data.me.name !== "string" ||
        (data.me.email !== null && typeof data.me.email !== "string") || (data.me.phone !== null && typeof data.me.phone !== "string") ||
        typeof data.me.isEmailVerified !== "boolean" || typeof data.me.isPhoneVerified !== "boolean") throw new AuthError("authError");
      const profile: MemberProfile = {
        ...(data.me.email !== null ? { email: data.me.email as string } : {}),
        ...(data.me.phone !== null ? { phone: data.me.phone as string } : {}),
        isEmailVerified: data.me.isEmailVerified, isPhoneVerified: data.me.isPhoneVerified,
      };
      publish({ ...snapshot, session: { ...snapshot.session!, name: data.me.name, profile, profileStatus: "ready", profileError: null } });
    } catch (error) {
      if (!isCurrent()) return;
      publish({ ...snapshot, session: { ...snapshot.session!, profileStatus: "error",
        profileError: error instanceof AuthError && error.kind === "connectionError" ? "connectionError" : "authError" } });
    }
  })().finally(() => { if (profileFlight?.promise === promise) profileFlight = null; });
  profileFlight = { generation: attempt, memberId, promise };
  return promise;
}

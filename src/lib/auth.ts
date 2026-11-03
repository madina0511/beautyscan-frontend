export class AuthError extends Error {
  constructor(public readonly kind: "authError" | "connectionError" | "sessionExpired") { super(kind); }
}

export async function authRequest(query: string, variables?: Record<string, unknown>, accessToken?: string): Promise<unknown> {
  try {
    const response = await fetch(process.env.NEXT_PUBLIC_GRAPHQL_URL || "http://localhost:3000/graphql", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(15000),
    });
    if (response.status === 401 || response.status === 403) throw new AuthError("sessionExpired");
    if (response.status >= 500) throw new AuthError("connectionError");
    if (!response.ok) throw new AuthError("authError");
    const payload: unknown = await response.json();
    if (isRecord(payload) && Array.isArray(payload.errors) && payload.errors.length) {
      const unauthorized = payload.errors.some(error => isRecord(error) && isRecord(error.extensions) &&
        (["UNAUTHENTICATED", "FORBIDDEN"].includes(String(error.extensions.code)) ||
          (isRecord(error.extensions.originalError) && [401, 403].includes(Number(error.extensions.originalError.statusCode)))));
      throw new AuthError(unauthorized ? "sessionExpired" : "authError");
    }
    if (!isRecord(payload) || !isRecord(payload.data)) throw new AuthError("authError");
    return payload.data;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError("connectionError");
  }
}

export const authOperations = {
  me: "query Me { me { id name email phone isEmailVerified isPhoneVerified } }",
  login: "mutation Login($input: LoginInput!) { login(input: $input) { accessToken member { id name email phone isEmailVerified isPhoneVerified } } }",
  signup: "mutation Signup($input: SignupDto!) { signup(input: $input) { id } }",
  refresh: "mutation Refresh { refresh { accessToken } }",
  logout: "mutation Logout { logout { success } }",
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

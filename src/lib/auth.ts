export class AuthError extends Error {
  constructor(
    public readonly kind:
      | "authError"
      | "invalidCredentials"
      | "emailAlreadyExists"
      | "connectionError"
      | "sessionExpired"
      | "serverError",
  ) {
    super(kind);
  }
}

type AuthOperation = "login" | "signup" | "session";

function classifyAuthErrors(
  errors: unknown[],
  status: number,
  operation: AuthOperation,
): AuthError["kind"] {
  const details = errors.map((error) => {
    const record = isRecord(error) ? error : {};
    const extensions = isRecord(record.extensions) ? record.extensions : {};
    const original = isRecord(extensions.originalError)
      ? extensions.originalError
      : {};
    return {
      code: extensions.code,
      status: extensions.status ?? original.statusCode,
      messages: [record.message, original.message],
    };
  });
  const duplicateEmail = (detail: (typeof details)[number]) =>
    operation === "signup" &&
    (detail.code === "EMAIL_ALREADY_EXISTS" ||
      detail.messages.some(
        (message) =>
          message === "Email is already registered" ||
          message === "Email or phone number is already registered",
      ));

  // Nest/Apollo can wrap a known HTTP 409 conflict as INTERNAL_SERVER_ERROR
  // in development. Only that explicit conflict can use the duplicate message.
  // A masked production INTERNAL_SERVER_ERROR must remain a server failure.
  if (
    status >= 500 ||
    details.some(
      (detail) =>
        (typeof detail.status === "number" && detail.status >= 500) ||
        (detail.code === "INTERNAL_SERVER_ERROR" &&
          !(detail.status === 409 && duplicateEmail(detail))),
    )
  ) return "serverError";

  if (details.some((detail) =>
    detail.code === "SESSION_EXPIRED" || detail.code === "TOKEN_EXPIRED"
  )) return "sessionExpired";

  if (operation === "login" && details.some((detail) =>
    detail.code === "INVALID_CREDENTIALS" ||
    detail.messages.includes("Invalid credentials")
  )) return "invalidCredentials";

  if (details.some(duplicateEmail)) return "emailAlreadyExists";

  // A generic auth rejection is not proof of a wrong password. In particular,
  // preserve refresh/protected-request handling without relabeling it as login.
  if (operation === "session" && (
    status === 401 || status === 403 ||
    details.some((detail) =>
      detail.code === "UNAUTHENTICATED" || detail.code === "FORBIDDEN" ||
      detail.status === 401 || detail.status === 403
    )
  )) return "sessionExpired";

  return "authError";
}

export async function authRequest(
  query: string,
  variables?: Record<string, unknown>,
  accessToken?: string,
  operation: AuthOperation = "session",
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(
      process.env.NEXT_PUBLIC_GRAPHQL_URL || "http://localhost:3000/graphql",
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(15000),
      },
    );
  } catch {
    throw new AuthError("connectionError");
  }
  if (response.status >= 500) throw new AuthError("serverError");

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (!response.ok)
      throw new AuthError(classifyAuthErrors([], response.status, operation));
    // A malformed JSON response is a server problem, not invalid credentials.
    throw new AuthError(
      isRecord(error) && error.name === "SyntaxError"
        ? "serverError"
        : "connectionError",
    );
  }
  const errors = isRecord(payload) && Array.isArray(payload.errors)
    ? payload.errors
    : [];
  if (!response.ok || errors.length)
    throw new AuthError(classifyAuthErrors(errors, response.status, operation));
  if (!isRecord(payload) || !isRecord(payload.data))
    throw new AuthError("serverError");
  return payload.data;
}

export const authOperations = {
  me: "query Me { me { id name email phone isEmailVerified isPhoneVerified } }",
  login:
    "mutation Login($input: LoginInput!) { login(input: $input) { accessToken member { id name email phone isEmailVerified isPhoneVerified } } }",
  signup:
    "mutation Signup($input: SignupDto!) { signup(input: $input) { id } }",
  refresh: "mutation Refresh { refresh { accessToken } }",
  logout: "mutation Logout { logout { success } }",
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

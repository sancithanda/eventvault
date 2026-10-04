
"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiRequest, type ApiError } from "@/lib/api";
import Link from "next/link";

type User = {
  id: string;
  name: string;
  email: string;
  status: string;
  createdAt?: string;
};

type Organization = {
  id: string;
  name: string;
  description?: string | null;
  role?: string;
  createdAt?: string;
};

type AuthResponse = {
  success: boolean;
  data: {
    user: User;
    accessToken?: string;
    tokenType?: string;
    expiresIn?: number;
  };
};

type MeResponse = {
  success: boolean;
  data: { user: User };
};

type OrganizationsResponse = {
  success: boolean;
  data: { organizations: Organization[] };
};

type Mode = "login" | "register";

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

function getFieldErrors(error: unknown): Record<string, string> {
  return (error as ApiError)?.fields ?? {};
}

function Brand() {
  return (
    <Link href="/" className="brand" aria-label="EventVault home">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none">
          <rect
            x="3"
            y="3"
            width="26"
            height="26"
            rx="9"
            fill="currentColor"
          />
          <path
            d="M10 11h12M10 16h8M10 21h12"
            stroke="#fff"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="22" cy="16" r="2" fill="#A7F3D0" />
        </svg>
      </span>
      <span>event<span className="brand-light">vault</span></span>
    </Link>
  );
}

function Icon({
  name,
  size = 20,
}: {
  name: "arrow" | "shield" | "wallet" | "users" | "logout" | "calendar";
  size?: number;
}) {
  const paths: Record<typeof name, React.ReactNode> = {
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    shield: (
      <>
        <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    wallet: (
      <>
        <rect x="3" y="5" width="18" height="15" rx="3" />
        <path d="M3 9h18m-5 5h.01" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="10" cy="7" r="4" />
        <path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    logout: (
      <>
        <path d="M10 17l5-5-5-5M15 12H3" />
        <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 11h18" />
      </>
    ),
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  const [restoring, setRestoring] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [organizationName, setOrganizationName] = useState("");
  const [creatingOrganization, setCreatingOrganization] = useState(false);
  const [organizationFormOpen, setOrganizationFormOpen] = useState(false);

  const loadDashboard = useCallback(async (accessToken: string) => {
    setDashboardLoading(true);

    try {
      const [meResponse, orgResponse] = await Promise.all([
        apiRequest<MeResponse>("/auth/me", {}, accessToken),
        apiRequest<OrganizationsResponse>("/organizations", {}, accessToken),
      ]);

      setUser(meResponse.data.user);
      setOrganizations(orgResponse.data.organizations);
    } catch (error) {
      const status = (error as ApiError).status;

      if (status === 401 || status === 403) {
        sessionStorage.removeItem("eventvault_token");
        setToken(null);
        setUser(null);
        setOrganizations([]);
        setMessage("Your session has expired. Please sign in again.");
      } else {
        setMessage(getErrorMessage(error));
      }
    } finally {
      setDashboardLoading(false);
    }
  }, []);

useEffect(() => {
  let cancelled = false;

  async function restoreSession() {
    const savedToken = sessionStorage.getItem("eventvault_token");

    if (savedToken) {
  setToken(savedToken);
  await loadDashboard(savedToken);
}

    if (!cancelled) {
      setRestoring(false);
    }
  }

  void restoreSession();

  return () => {
    cancelled = true;
  };
}, [loadDashboard]);
  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setMessage("");
    setFieldErrors({});
    setPassword("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setFieldErrors({});
    setSubmitting(true);

    try {
      if (mode === "register") {
        await apiRequest<AuthResponse>("/auth/register", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
        });

        setMode("login");
        setPassword("");
        setMessage("Account created. Sign in with your new credentials.");
        return;
      }

      const response = await apiRequest<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const accessToken = response.data.accessToken;

      if (!accessToken) {
        throw new Error("The server did not return an access token.");
      }

      sessionStorage.setItem("eventvault_token", accessToken);
      setToken(accessToken);
      setUser(response.data.user);
      setPassword("");
      setMessage("");
      await loadDashboard(accessToken);
    } catch (error) {
      setMessage(getErrorMessage(error));
      setFieldErrors(getFieldErrors(error));
    } finally {
      setSubmitting(false);
    }
  }
  async function handleCreateOrganization(
  event: FormEvent<HTMLFormElement>,
) {
  event.preventDefault();

  if (!token || creatingOrganization) {
    return;
  }

  const trimmedName = organizationName.trim();

  if (trimmedName.length < 2 || trimmedName.length > 150) {
    setMessage("Organization name must be between 2 and 150 characters.");
    return;
  }

  setCreatingOrganization(true);
  setMessage("");

  try {
    await apiRequest("/organizations", {
      method: "POST",
      body: JSON.stringify({ name: trimmedName }),
    }, token);

    setOrganizationName("");
    setOrganizationFormOpen(false);
    setMessage("Organization created successfully.");

    await loadDashboard(token);
  } catch (error) {
    setMessage(getErrorMessage(error));
    setFieldErrors(getFieldErrors(error));
  } finally {
    setCreatingOrganization(false);
  }
}

  function logout() {
    sessionStorage.removeItem("eventvault_token");
    setToken(null);
    setUser(null);
    setOrganizations([]);
    setPassword("");
    setMessage("You have been signed out.");
    setMode("login");
  }

  if (restoring) {
    return (
      <main className="loading-screen">
        <span className="loading-mark">E</span>
        <p>Opening your workspace…</p>
      </main>
    );
  }

  if (token && user) {
    return (
      <main className="dashboard-page">
        <header className="topbar">
          <Brand />
          <div className="topbar-right">
            <div className="user-chip">
              <span className="avatar">{user.name.charAt(0).toUpperCase()}</span>
              <span className="user-chip-name">{user.name}</span>
            </div>
            <button className="logout-button" onClick={logout} type="button">
              <Icon name="logout" size={17} />
              <span>Sign out</span>
            </button>
          </div>
        </header>

        <section className="dashboard-content">
          <div className="dashboard-heading">
            <div>
              <span className="eyebrow">YOUR WORKSPACE</span>
              <h1>Good to have you here, {user.name.split(" ")[0]}.</h1>
              <p>Keep your teams, events, and shared finances in one place.</p>
            </div>
            <span className="status-pill">
              <span className="status-dot" />
              Account {user.status.toLowerCase()}
            </span>
          </div>

          {message && <div className="notice">{message}</div>}

          <div className="stat-grid">
            <article className="stat-card">
              <span className="stat-icon green"><Icon name="users" /></span>
              <span className="stat-label">Organizations</span>
              <strong>{organizations.length}</strong>
              <span className="stat-caption">Your accessible workspaces</span>
            </article>
            <article className="stat-card">
              <span className="stat-icon blue"><Icon name="calendar" /></span>
              <span className="stat-label">Events</span>
              <strong>—</strong>
              <span className="stat-caption">Event overview coming next</span>
            </article>
            <article className="stat-card">
              <span className="stat-icon purple"><Icon name="wallet" /></span>
              <span className="stat-label">Financial activity</span>
              <strong>—</strong>
              <span className="stat-caption">Ledger overview coming next</span>
            </article>
          </div>

          <section className="organizations-section">
            <div className="section-heading">
  <div>
    <span className="eyebrow">TEAM MANAGEMENT</span>
    <h2>Your organizations</h2>
    <p>Organizations you have access to appear here.</p>
  </div>

  <div className="section-actions">
    <span className="count-badge">{organizations.length} total</span>
    <button
      className="primary-button"
      type="button"
      onClick={() => {
        setOrganizationFormOpen((open) => !open);
        setMessage("");
      }}
    >
      {organizationFormOpen ? "Cancel" : "+ Create organization"}
    </button>
  </div>
</div>

{organizationFormOpen && (
  <form
    className="organization-form"
    onSubmit={handleCreateOrganization}
  >
    <label htmlFor="organization-name">Organization name</label>
    <input
      id="organization-name"
      name="organizationName"
      type="text"
      value={organizationName}
      onChange={(event) => setOrganizationName(event.target.value)}
      placeholder="e.g. College Fest Committee"
      minLength={2}
      maxLength={150}
      required
      disabled={creatingOrganization}
    />
    <p>Choose a name between 2 and 150 characters.</p>

    {fieldErrors.name && (
      <p className="field-error">{fieldErrors.name}</p>
    )}

    <button
      className="primary-button"
      type="submit"
      disabled={creatingOrganization}
    >
      {creatingOrganization ? "Creating..." : "Create organization"}
    </button>
  </form>
)}

            {dashboardLoading ? (
              <div className="empty-panel">
                <span className="spinner" />
                <p>Loading your workspace…</p>
              </div>
            ) : organizations.length === 0 ? (
              <div className="empty-panel">
                <span className="empty-icon"><Icon name="users" size={25} /></span>
                <h3>Your workspace starts here</h3>
                <p>
                  You are signed in, but you do not belong to an organization
                  yet. Organization creation will be the next dashboard feature.
                </p>
              </div>
            ) : (
              <div className="organization-grid">
                {organizations.map((organization) => (
                  <article className="organization-card" key={organization.id}>
                    <div className="organization-card-top">
                      <span className="organization-icon">
                        <Icon name="users" size={22} />
                      </span>
                      {organization.role && (
                        <span className="role-badge">
                          {organization.role.replaceAll("_", " ")}
                        </span>
                      )}
                    </div>
                    <h3>{organization.name}</h3>
                    <p>{organization.description || "Organization workspace"}</p>
                    <div className="organization-footer">
                      <span><Icon name="shield" size={15} /> Access controlled</span>
                      <span className="organization-id" title={organization.id}>
                        ID · {organization.id.slice(0, 8)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <div className="security-note">
            <Icon name="shield" size={19} />
            <p>
              <strong>Your finances deserve an audit trail.</strong>
              {" "}EventVault uses controlled access and recorded financial transactions.
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="story-content">
          <Brand />
          <div className="story-copy">
            <span className="eyebrow story-eyebrow">SHARED MONEY. CLEAR RECORDS.</span>
            <h1>Good events deserve <span>better finances.</span></h1>
            <p>
              Coordinate your team, manage event funds, and keep every
              transaction accountable — without losing track of a single rupee.
            </p>
            <div className="feature-list">
              <div className="feature-item">
                <span className="feature-icon"><Icon name="wallet" /></span>
                <div><strong>One financial source of truth</strong><span>Track transactions in a shared ledger.</span></div>
              </div>
              <div className="feature-item">
                <span className="feature-icon"><Icon name="users" /></span>
                <div><strong>Access by role</strong><span>Give the right people the right permissions.</span></div>
              </div>
              <div className="feature-item">
                <span className="feature-icon"><Icon name="shield" /></span>
                <div><strong>Accountability built in</strong><span>Keep a record of financial actions.</span></div>
              </div>
            </div>
          </div>
          <div className="story-footer">
            <span className="footer-dot" /> Built for teams that value transparency.
          </div>
        </div>
        <div className="story-decoration decoration-one" />
        <div className="story-decoration decoration-two" />
      </section>

      <section className="auth-panel">
        <div className="mobile-brand"><Brand /></div>
        <div className="auth-card">
          <div className="auth-heading">
            <span className="eyebrow">{mode === "login" ? "WELCOME BACK" : "GET STARTED"}</span>
            <h2>{mode === "login" ? "Sign in to EventVault" : "Create your account"}</h2>
            <p>
              {mode === "login"
                ? "Access your organizations and event finances."
                : "Set up your account to manage shared event finances."}
            </p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
            <button
              className={mode === "login" ? "auth-tab active" : "auth-tab"}
              onClick={() => switchMode("login")}
              type="button"
              role="tab"
              aria-selected={mode === "login"}
            >
              Sign in
            </button>
            <button
              className={mode === "register" ? "auth-tab active" : "auth-tab"}
              onClick={() => switchMode("register")}
              type="button"
              role="tab"
              aria-selected={mode === "register"}
            >
              Create account
            </button>
          </div>

          {message && (
            <div className="notice" role="status">{message}</div>
          )}

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {mode === "register" && (
              <label className="form-field">
                <span>Full name</span>
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  minLength={2}
                  maxLength={100}
                  required
                  aria-invalid={Boolean(fieldErrors.name)}
                />
                {fieldErrors.name && <small className="field-error">{fieldErrors.name}</small>}
              </label>
            )}

            <label className="form-field">
              <span>Email address</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                maxLength={255}
                required
                aria-invalid={Boolean(fieldErrors.email)}
              />
              {fieldErrors.email && <small className="field-error">{fieldErrors.email}</small>}
            </label>

            <label className="form-field">
              <span>Password</span>
              <div className="password-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === "register" ? "At least 12 characters" : "Enter your password"}
                  minLength={mode === "register" ? 12 : undefined}
                  maxLength={128}
                  required
                  aria-invalid={Boolean(fieldErrors.password)}
                />
                <button
                  className="password-toggle"
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {fieldErrors.password && <small className="field-error">{fieldErrors.password}</small>}
              {mode === "register" && (
                <small className="field-hint">Use 12–128 characters.</small>
              )}
            </label>

            <button className="submit-button" type="submit" disabled={submitting}>
              {submitting ? (
                <><span className="button-spinner" /> {mode === "login" ? "Signing in…" : "Creating account…"}</>
              ) : (
                <>{mode === "login" ? "Sign in to your account" : "Create account"} <Icon name="arrow" size={18} /></>
              )}
            </button>
          </form>

          <div className="auth-assurance">
            <Icon name="shield" size={17} />
            <span>Your account is protected by authenticated API access.</span>
          </div>
          <p className="auth-switch">
            {mode === "login" ? "New to EventVault?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => switchMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
        <footer className="panel-footer">© {new Date().getFullYear()} EventVault</footer>
      </section>
    </main>
  );
}
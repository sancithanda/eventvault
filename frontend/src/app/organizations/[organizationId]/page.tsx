
"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiRequest, type ApiError } from "@/lib/api";

type Organization = {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  members: Array<{
    role: string;
    status: string;
    joinedAt: string | null;
  }>;
  _count: {
    members: number;
    events: number;
  };
};

type EventItem = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  currency: string;
  createdAt: string;
  wallet: {
    id: string;
    name: string;
    currency: string;
    status: string;
  } | null;
  _count?: {
    members: number;
  };
};

type OrganizationsResponse = {
  success: boolean;
  data: {
    organizations: Organization[];
  };
};

type EventsResponse = {
  success: boolean;
  data: EventItem[];
};

type CreateEventResponse = {
  success: boolean;
  data: {
    event: EventItem;
  };
};

type CreateEventForm = {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  currency: string;
};

const INITIAL_FORM: CreateEventForm = {
  name: "",
  description: "",
  startDate: "",
  endDate: "",
  currency: "INR",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "Not set";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Not set";

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

function WorkspaceContent() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const router = useRouter();

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CreateEventForm>(INITIAL_FORM);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");

    const token = sessionStorage.getItem("eventvault_token");

    if (!token) {
      router.replace("/");
      return;
    }

    try {
      const [organizationsResponse, eventsResponse] = await Promise.all([
        apiRequest<OrganizationsResponse>("/organizations", {}, token),
        apiRequest<EventsResponse>(
          `/organizations/${organizationId}/events`,
          {},
          token,
        ),
      ]);

      const foundOrganization =
        organizationsResponse.data.organizations.find(
          (item) => item.id === organizationId,
        );

      if (!foundOrganization) {
        setOrganization(null);
        setEvents([]);
        setError("This organization was not found or you do not have access to it.");
        return;
      }

      setOrganization(foundOrganization);
      setEvents(eventsResponse.data);
    } catch (err) {
      const apiError = err as ApiError;

      if (apiError.status === 401) {
        sessionStorage.removeItem("eventvault_token");
        router.replace("/");
        return;
      }

      setError(
        apiError.status === 403
          ? "You do not have permission to access this organization's events."
          : getErrorMessage(err),
      );
    } finally {
      setLoading(false);
    }
  }, [organizationId, router]);

useEffect(() => {
  const timeoutId = setTimeout(() => {
    void loadWorkspace();
  }, 0);

  return () => clearTimeout(timeoutId);
}, [loadWorkspace]);

  const role = organization?.members[0]?.role ?? "MEMBER";
  const canCreateEvent = ["OWNER", "ADMIN"].includes(role.toUpperCase());

  function updateField(field: keyof CreateEventForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFormError("");
    setNotice("");
  }

  async function handleCreateEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setNotice("");

    const name = form.name.trim();

    if (name.length < 2 || name.length > 150) {
      setFormError("Event name must contain between 2 and 150 characters.");
      return;
    }

    if (form.startDate && form.endDate) {
      if (new Date(form.endDate) < new Date(form.startDate)) {
        setFormError("The end date cannot be earlier than the start date.");
        return;
      }
    }

    const token = sessionStorage.getItem("eventvault_token");

    if (!token) {
      router.replace("/");
      return;
    }

    const payload: {
      name: string;
      description?: string;
      startDate?: string;
      endDate?: string;
      currency: string;
    } = {
      name,
      currency: form.currency,
    };

    if (form.description.trim()) {
      payload.description = form.description.trim();
    }

    if (form.startDate) {
      payload.startDate = new Date(form.startDate).toISOString();
    }

    if (form.endDate) {
      payload.endDate = new Date(form.endDate).toISOString();
    }

    setSubmitting(true);

    try {
      const response = await apiRequest<CreateEventResponse>(
        `/organizations/${organizationId}/events`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        token,
      );

      setEvents((current) => [
        response.data.event,
        ...current.filter((item) => item.id !== response.data.event.id),
      ]);

      setOrganization((current) =>
        current
          ? {
              ...current,
              _count: {
                ...current._count,
                events: current._count.events + 1,
              },
            }
          : current,
      );

      setForm(INITIAL_FORM);
      setFormOpen(false);
      setNotice("Event created successfully.");
    } catch (err) {
      const apiError = err as ApiError;

      if (apiError.status === 401) {
        sessionStorage.removeItem("eventvault_token");
        router.replace("/");
        return;
      }

      setFormError(
        apiError.status === 403
          ? "Your organization role does not permit event creation."
          : getErrorMessage(err),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="loading-screen">
        <div className="loading-mark">E</div>
        <div className="spinner" aria-label="Loading" />
        <p>Loading organization workspace...</p>
      </main>
    );
  }

  if (error || !organization) {
    return (
      <main className="dashboard-page">
        <header className="topbar">
          <Link href="/" className="brand">
            <span className="brand-mark">E</span>
            EventVault
          </Link>
        </header>
        <section className="dashboard-content">
          <div className="notice" role="alert">
            {error || "Organization could not be loaded."}
          </div>
          <Link href="/" className="workspace-back-link">
            ← Back to dashboard
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-page">
      <header className="topbar">
        <Link href="/" className="brand">
          <span className="brand-mark">E</span>
          EventVault
        </Link>

        <div className="topbar-right">
          <Link href="/" className="workspace-back-link">
            ← Dashboard
          </Link>
        </div>
      </header>

      <div className="dashboard-content workspace-content">
        <nav className="workspace-breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Organizations</Link>
          <span>/</span>
          <span>{organization.name}</span>
        </nav>

        <section className="dashboard-heading workspace-heading">
          <div>
            <span className="eyebrow">ORGANIZATION WORKSPACE</span>
            <h1>{organization.name}</h1>
            <p>
              Manage events and prepare to track shared expenses in one place.
            </p>
          </div>

          <span className="status-pill">
            <span className="status-dot" />
            {role.toLowerCase()}
          </span>
        </section>

        <section className="stat-grid workspace-stat-grid">
          <article className="stat-card">
            <div className="stat-icon green">E</div>
            <span className="stat-label">Total events</span>
            <strong>{organization._count.events}</strong>
            <span className="stat-caption">In this organization</span>
          </article>

          <article className="stat-card">
            <div className="stat-icon blue">M</div>
            <span className="stat-label">Members</span>
            <strong>{organization._count.members}</strong>
            <span className="stat-caption">Organization members</span>
          </article>

          <article className="stat-card">
            <div className="stat-icon purple">R</div>
            <span className="stat-label">Your role</span>
            <strong className="workspace-role-value">{role}</strong>
            <span className="stat-caption">Organization access</span>
          </article>
        </section>

        <section className="organizations-section">
          <div className="section-heading workspace-events-heading">
            <div>
              <span className="eyebrow">EVENT MANAGEMENT</span>
              <h2>Events</h2>
              <p>View your events or create a new one.</p>
            </div>

            {canCreateEvent && (
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setFormOpen((current) => !current);
                  setFormError("");
                  setNotice("");
                }}
              >
                {formOpen ? "Cancel" : "+ Create event"}
              </button>
            )}
          </div>

          {notice && (
            <div className="notice" role="status">
              {notice}
            </div>
          )}

          {formOpen && canCreateEvent && (
            <form
              className="organization-form workspace-event-form"
              onSubmit={handleCreateEvent}
            >
              <div>
                <h3>Create an event</h3>
                <p>
                  Add the basic details. You can manage event members and
                  transactions after creation.
                </p>
              </div>

              <label htmlFor="event-name">Event name *</label>
              <input
                id="event-name"
                name="name"
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="e.g. College Fest 2026"
                minLength={2}
                maxLength={150}
                required
                disabled={submitting}
              />

              <label htmlFor="event-description">Description</label>
              <textarea
                id="event-description"
                name="description"
                value={form.description}
                onChange={(event) =>
                  updateField("description", event.target.value)
                }
                placeholder="What is this event for?"
                maxLength={2000}
                rows={3}
                disabled={submitting}
              />

              <div className="workspace-form-grid">
                <div className="workspace-field">
                  <label htmlFor="event-start">Start date</label>
                  <input
                    id="event-start"
                    name="startDate"
                    type="datetime-local"
                    value={form.startDate}
                    onChange={(event) =>
                      updateField("startDate", event.target.value)
                    }
                    disabled={submitting}
                  />
                </div>

                <div className="workspace-field">
                  <label htmlFor="event-end">End date</label>
                  <input
                    id="event-end"
                    name="endDate"
                    type="datetime-local"
                    value={form.endDate}
                    min={form.startDate || undefined}
                    onChange={(event) =>
                      updateField("endDate", event.target.value)
                    }
                    disabled={submitting}
                  />
                </div>
              </div>

              <label htmlFor="event-currency">Currency</label>
              <select
                id="event-currency"
                name="currency"
                value={form.currency}
                onChange={(event) => updateField("currency", event.target.value)}
                disabled={submitting}
              >
                <option value="INR">INR — Indian Rupee</option>
                <option value="USD">USD — US Dollar</option>
                <option value="EUR">EUR — Euro</option>
                <option value="GBP">GBP — British Pound</option>
              </select>

              {formError && (
                <p className="field-error" role="alert">
                  {formError}
                </p>
              )}

              <div className="workspace-form-actions">
                <button
                  type="button"
                  className="workspace-secondary-button"
                  onClick={() => {
                    setFormOpen(false);
                    setForm(INITIAL_FORM);
                    setFormError("");
                  }}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={submitting}
                >
                  {submitting ? "Creating..." : "Create event"}
                </button>
              </div>
            </form>
          )}

          {!canCreateEvent && (
            <div className="workspace-permission-note">
              Only organization owners and admins can create events.
            </div>
          )}

          {events.length === 0 ? (
            <div className="empty-panel">
              <div className="empty-icon">
                <span aria-hidden="true">E</span>
              </div>
              <h3>No events yet</h3>
              <p>
                {canCreateEvent
                  ? "Create your first event to start organizing activities and shared finances."
                  : "Events created in this organization will appear here."}
              </p>
              {canCreateEvent && !formOpen && (
                <button
                  type="button"
                  className="primary-button workspace-empty-button"
                  onClick={() => setFormOpen(true)}
                >
                  Create your first event
                </button>
              )}
            </div>
          ) : (
            <div className="workspace-event-grid">
              {events.map((item) => (
                <article className="workspace-event-card" key={item.id}>
                  <div className="workspace-event-card-top">
                    <div className="organization-icon" aria-hidden="true">
                      <span>EV</span>
                    </div>
                    <span
                      className={`workspace-event-status status-${item.status.toLowerCase()}`}
                    >
                      {item.status.replaceAll("_", " ").toLowerCase()}
                    </span>
                  </div>

                  <h3>{item.name}</h3>
                  <p className="workspace-event-description">
                    {item.description || "No description added."}
                  </p>

                  <div className="workspace-event-meta">
                    <div>
                      <span>Start date</span>
                      <strong>{formatDate(item.startDate)}</strong>
                    </div>
                    <div>
                      <span>End date</span>
                      <strong>{formatDate(item.endDate)}</strong>
                    </div>
                    <div>
                      <span>Members</span>
<strong>{item._count?.members ?? 0}</strong>
                    </div>
                    <div>
                      <span>Currency</span>
                      <strong>{item.currency}</strong>
                    </div>
                  </div>

                  {item.wallet && (
                    <div className="workspace-wallet-line">
                      <span>Wallet: {item.wallet.name}</span>
                      <span>{item.wallet.currency}</span>
                    </div>
                  )}

                  <div className="workspace-event-footer">
                    <span>Created {formatDate(item.createdAt)}</span>
                    <span className="workspace-event-id">
                      ID: {item.id.slice(0, 8)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="security-note workspace-security-note">
          <span aria-hidden="true">✓</span>
          <p>
            <strong>Controlled access.</strong> Event creation permissions are
            enforced by the backend. Financial transactions remain subject to
            the server-side authorization and wallet rules.
          </p>
        </aside>
      </div>
    </main>
  );
}

export default function OrganizationWorkspacePage() {
  return (
    <Suspense
      fallback={
        <main className="loading-screen">
          <div className="loading-mark">E</div>
          <p>Opening organization workspace...</p>
        </main>
      }
    >
      <WorkspaceContent />
    </Suspense>
  );
}

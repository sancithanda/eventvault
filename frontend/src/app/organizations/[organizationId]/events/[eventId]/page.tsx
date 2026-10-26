"use client";

import { useCallback, useEffect, useState } from "react";import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";

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
};

type OrganizationEventsResponse = {
  success: boolean;
  data: EventItem[];
};

type Member = {
  id: string;
  userId: string;
  role: string;
  status: string;
  joinedAt: string | null;
  user: {
    id: string;
    name: string;
    email: string;
  };
};

type MembersResponse = {
  success: boolean;
  data: Member[];
};

type Transaction = {
  id: string;
  type: string;
  amountPaise: string;
  description: string | null;
  category: string | null;
  createdAt: string;
};

type TransactionsResponse = {
  success: boolean;
  data: Transaction[];
};

type WalletResponse = {
  success: boolean;
  data: {
    id: string;
    name: string;
    currency: string;
    status: string;
    balancePaise: string;
  };
};

function formatDate(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatAmount(amountPaise: string, currency: string) {
  const amount = Number(amountPaise) / 100;

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while loading the event.";
}

export default function EventDetailsPage() {
  const params = useParams<{
    organizationId: string;
    eventId: string;
  }>();

  const router = useRouter();

  const { organizationId, eventId } = params;

  const [event, setEvent] = useState<EventItem | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [wallet, setWallet] = useState<WalletResponse["data"] | null>(null);

  const [loading, setLoading] = useState(true);
const [error, setError] = useState("");
const [financialRestriction, setFinancialRestriction] = useState("");

    const loadEventDetails = useCallback(async () => {
    setLoading(true);
    setError("");
    setFinancialRestriction("");

    const token = sessionStorage.getItem("eventvault_token");

    if (!token) {
      router.replace("/");
      return;
    }

    try {
      const organizationEventsResponse =
        await apiRequest<OrganizationEventsResponse>(
          `/organizations/${organizationId}/events`,
          {},
          token,
        );

      const foundEvent = organizationEventsResponse.data.find(
        (item) => item.id === eventId,
      );

      if (!foundEvent) {
        setEvent(null);
        setError("This event was not found or you do not have access to it.");
        return;
      }

      setEvent(foundEvent);

      const [membersResult, transactionsResult, walletResult] =
        await Promise.allSettled([
          apiRequest<MembersResponse>(
            `/organizations/${organizationId}/events/${eventId}/members`,
            {},
            token,
          ),
          apiRequest<TransactionsResponse>(
            `/organizations/${organizationId}/events/${eventId}/transactions`,
            {},
            token,
          ),
          apiRequest<WalletResponse>(
            `/organizations/${organizationId}/events/${eventId}/wallet`,
            {},
            token,
          ),
        ]);

      if (membersResult.status === "fulfilled") {
        setMembers(membersResult.value.data);
      }

      if (transactionsResult.status === "fulfilled") {
        setTransactions(transactionsResult.value.data);
      }

      if (walletResult.status === "fulfilled") {
        setWallet(walletResult.value.data);
      }

      const restrictedResults = [
        transactionsResult,
        walletResult,
      ];

      const hasUnauthorizedAccess = restrictedResults.some(
        (result) =>
          result.status === "rejected" &&
          (result.reason as ApiError)?.status === 403,
      );

      if (hasUnauthorizedAccess) {
  setFinancialRestriction(
    "You are not an active member of this event, so financial information is restricted.",
  );
}
    } catch (err) {
      const apiError = err as ApiError;

      if (apiError.status === 401) {
        sessionStorage.removeItem("eventvault_token");
        router.replace("/");
        return;
      }

      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [eventId, organizationId, router]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadEventDetails();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadEventDetails]);

  if (loading) {
    return (
      <main className="dashboard-page">
        <div className="dashboard-content">
          <p>Loading event...</p>
        </div>
      </main>
    );
  }

  if (error || !event) {
    return (
      <main className="dashboard-page">
        <div className="dashboard-content">
          <Link
            href={`/organizations/${organizationId}`}
            className="workspace-back-link"
          >
            ← Back to organization
          </Link>

          <section className="workspace-empty-state">
            <h1>Event unavailable</h1>
            <p>{error || "This event could not be loaded."}</p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-page">
      <div className="workspace-content event-details-page">
        <Link
          href={`/organizations/${organizationId}`}
          className="workspace-back-link event-back-link"
        >
          ← Back to organization
        </Link>

        <section className="event-hero">
          <div className="event-hero-main">
            <span className="eyebrow">Event workspace</span>

            <div className="event-title-row">
              <h1>{event.name}</h1>

              <span
                className={`event-status status-${event.status.toLowerCase()}`}
              >
                {event.status.replaceAll("_", " ").toLowerCase()}
              </span>
            </div>

            <p>
              {event.description ||
                "No description has been added for this event."}
            </p>
          </div>

          <div className="event-hero-meta">
            <div>
              <span>Event ID</span>
              <strong>{event.id.slice(0, 8)}</strong>
            </div>

            <div>
              <span>Created</span>
              <strong>{formatDateTime(event.createdAt)}</strong>
            </div>
          </div>
        </section>

        <section className="event-stat-grid">
          <article className="event-stat-card">
            <span className="event-stat-label">Start date</span>
            <strong>{formatDate(event.startDate)}</strong>
          </article>

          <article className="event-stat-card">
            <span className="event-stat-label">End date</span>
            <strong>{formatDate(event.endDate)}</strong>
          </article>

          <article className="event-stat-card">
            <span className="event-stat-label">Members</span>
            <strong>{members.length}</strong>
          </article>

          <article className="event-stat-card">
            <span className="event-stat-label">Currency</span>
            <strong>{event.currency}</strong>
          </article>
        </section>

        <section className="event-overview-grid">
          <article className="event-panel">
            <div className="event-panel-heading">
              <div>
                <span className="eyebrow">Event overview</span>
                <h2>Details</h2>
              </div>
            </div>

            <div className="event-detail-list">
              <div>
                <span>Event name</span>
                <strong>{event.name}</strong>
              </div>

              <div>
                <span>Description</span>
                <strong>
                  {event.description || "No description added"}
                </strong>
              </div>

              <div>
                <span>Start date</span>
                <strong>{formatDate(event.startDate)}</strong>
              </div>

              <div>
                <span>End date</span>
                <strong>{formatDate(event.endDate)}</strong>
              </div>
            </div>
          </article>

          <article className="event-panel event-wallet-panel">
            <div className="event-panel-heading">
              <div>
                <span className="eyebrow">Shared wallet</span>
                <h2>
                  {wallet?.name || event.wallet?.name || "Main Wallet"}
                </h2>
              </div>

              <span className="event-wallet-status">
                {wallet?.status || event.wallet?.status || "ACTIVE"}
              </span>
            </div>

            {financialRestriction ? (
              <div className="event-restricted-state">
                <div className="event-restricted-icon">↗</div>

                <div>
                  <strong>Financial access restricted</strong>
                  <p>
                    You must be an active member of this event to view
                    wallet information.
                  </p>
                </div>
              </div>
            ) : (
              <div className="event-balance">
                <span>Current balance</span>

                <strong>
                  {formatAmount(
                    wallet?.balancePaise || "0",
                    wallet?.currency || event.currency,
                  )}
                </strong>
              </div>
            )}
          </article>
        </section>

        <section className="event-section">
          <div className="event-section-heading">
            <div>
              <span className="eyebrow">Participants</span>
              <h2>Event members</h2>
            </div>

            <span className="event-count">
              {members.length} {members.length === 1 ? "member" : "members"}
            </span>
          </div>

          {members.length === 0 ? (
            <div className="event-empty-state">
              <div className="event-empty-icon">+</div>

              <div>
                <strong>No event members yet</strong>
                <p>
                  Members added to this event will appear here.
                </p>
              </div>
            </div>
          ) : (
            <div className="event-members-grid">
              {members.map((member) => (
                <article className="event-member-card" key={member.id}>
                  <div className="event-member-avatar">
                    {member.user.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="event-member-info">
                    <strong>{member.user.name}</strong>
                    <span>{member.user.email}</span>
                  </div>

                  <span className="event-member-role">
                    {member.role}
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="event-section">
          <div className="event-section-heading">
            <div>
              <span className="eyebrow">Financial activity</span>
              <h2>Recent transactions</h2>
            </div>

            <span className="event-count">
              {financialRestriction
                ? "Restricted"
                : `${transactions.length} ${
                    transactions.length === 1
                      ? "transaction"
                      : "transactions"
                  }`}
            </span>
          </div>

          {financialRestriction ? (
            <div className="event-restricted-panel">
              <div className="event-restricted-icon">↗</div>

              <div>
                <strong>Financial information is restricted</strong>
                <p>
                  You are not an active member of this event, so wallet
                  transactions are not available to you.
                </p>
              </div>
            </div>
          ) : transactions.length === 0 ? (
            <div className="event-empty-state">
              <div className="event-empty-icon">+</div>

              <div>
                <strong>No transactions yet</strong>
                <p>
                  Transactions recorded for this event will appear here.
                </p>
              </div>
            </div>
          ) : (
            <div className="event-transactions">
              {transactions.map((transaction) => (
                <article
                  className="event-transaction-card"
                  key={transaction.id}
                >
                  <div className="event-transaction-type">
                    <span>{transaction.type}</span>
                  </div>

                  <div className="event-transaction-main">
                    <strong>
                      {transaction.description ||
                        "Untitled transaction"}
                    </strong>

                    <span>
                      {transaction.category || "Uncategorized"}
                    </span>
                  </div>

                  <strong className="event-transaction-amount">
                    {formatAmount(
                      transaction.amountPaise,
                      event.currency,
                    )}
                  </strong>

                  <span className="event-transaction-date">
                    {formatDateTime(transaction.createdAt)}
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
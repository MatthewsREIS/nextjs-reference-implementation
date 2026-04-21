import { gql } from "@apollo/client";
import { getIntrospectionQuery } from "graphql";

// --- Card 1: RSC scalar query with `where` ---
export const NOTIFICATIONS_COUNT_QUERY = gql`
  query NotificationsCount {
    notifications(where: { read: false }) {
      totalCount
    }
  }
`;

// --- Cards 2 and 4: cursor pagination + orderBy ---
// Reused: card 2 fetches via useQuery with fetchMore; card 4 is preloaded
// server-side and consumed via useSuspenseQuery.
export const RECENT_NOTIFICATIONS_QUERY = gql`
  query RecentNotifications($first: Int!, $after: Cursor, $read: Boolean!) {
    notifications(
      first: $first
      after: $after
      where: { read: $read }
      orderBy: { direction: DESC, field: CREATED_AT }
    ) {
      edges {
        node {
          id
          createdAt
          read
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;

// --- Card 3: full-text search via Meilisearch-backed `search` field ---
export const SEARCH_PROPOSALS_QUERY = gql`
  query SearchProposals($query: String!) {
    proposals(where: { search: $query }, first: 10) {
      edges {
        node {
          id
          name
          client {
            id
            fullName
          }
        }
      }
    }
  }
`;

// --- Card 5: read current value + no-op mutation ---
// Uses `calendarURL` (nullable String) so the demo works even when the field
// is unset — we just write the current value (possibly null) back unchanged.
export const CALENDAR_URL_QUERY = gql`
  query CalendarUrl {
    UserSettings {
      calendarURL
    }
  }
`;

export const UPDATE_CALENDAR_URL_NOOP_MUTATION = gql`
  mutation UpdateCalendarUrlNoOp($calendarURL: String) {
    UpdateUserSettings(input: { calendarURL: $calendarURL }) {
      calendarURL
    }
  }
`;

// --- Card 7: introspection query rendered as SDL via printSchema ---
// Standard GraphQL introspection — graphql package is already a dep.
export const INTROSPECTION_QUERY = gql(getIntrospectionQuery());

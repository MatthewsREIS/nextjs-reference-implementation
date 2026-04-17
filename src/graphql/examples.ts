import { gql } from "@apollo/client";

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

// --- Card 3: search + edge filter + or-composition ---
export const SEARCH_PROPOSALS_QUERY = gql`
  query SearchProposals($query: String!) {
    proposals(
      where: {
        or: [
          { nameContainsFold: $query }
          { hasClientWith: [{ fullNameContainsFold: $query }] }
        ]
      }
      first: 10
    ) {
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
// The mutation writes the value back unchanged.
export const WEEKLY_CALL_COMMITMENT_QUERY = gql`
  query WeeklyCallCommitment {
    viewer {
      id
      weeklyCallCommitment
    }
  }
`;

export const UPDATE_COMMITMENTS_NOOP_MUTATION = gql`
  mutation UpdateCommitmentsNoOp($weeklyCallCommitment: Int!) {
    UpdateUserSettings(
      input: { weeklyCallCommitment: $weeklyCallCommitment }
    ) {
      weeklyCallCommitment
    }
  }
`;

import { gql } from "@apollo/client";

// Replace with a real Artemis query. This placeholder uses the standard
// GraphQL introspection root so the example renders even before Artemis
// is wired up.
export const EXAMPLE_QUERY = gql`
  query Example {
    __typename
  }
`;

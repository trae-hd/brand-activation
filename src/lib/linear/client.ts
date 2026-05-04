export interface LinearIssueInput {
  title: string;
  description: string;
  teamId: string;
  priority: 0 | 1 | 2 | 3 | 4; // 0=no priority, 1=urgent, 2=high, 3=medium, 4=low
  labelNames?: string[];
}

export interface LinearIssueResult {
  ok: true;
  issueId: string;
  issueUrl: string;
}

const LINEAR_API = "https://api.linear.app/graphql";

const CREATE_ISSUE_MUTATION = `
  mutation CreateIssue($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue {
        id
        url
      }
    }
  }
`;

export async function createLinearIssue(
  apiKey: string,
  input: LinearIssueInput
): Promise<LinearIssueResult | { ok: false; error: string }> {
  try {
    const res = await fetch(LINEAR_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({
        query: CREATE_ISSUE_MUTATION,
        variables: {
          input: {
            title: input.title,
            description: input.description,
            teamId: input.teamId,
            priority: input.priority,
          },
        },
      }),
    });

    if (!res.ok) {
      return { ok: false, error: `Linear API HTTP ${res.status}` };
    }

    const json = (await res.json()) as {
      data?: { issueCreate?: { success: boolean; issue?: { id: string; url: string } } };
      errors?: { message: string }[];
    };

    if (json.errors?.length) {
      return { ok: false, error: json.errors[0]?.message ?? "Unknown Linear error" };
    }

    const created = json.data?.issueCreate;
    if (!created?.success || !created.issue) {
      return { ok: false, error: "issueCreate returned success=false" };
    }

    return { ok: true, issueId: created.issue.id, issueUrl: created.issue.url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

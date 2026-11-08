import { Component, type ReactNode } from "react";
import { mockApiModule as mockCreateApiModule } from "@/lib/testUtils/mockApi";
import { render, screen, waitFor } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { TestI18nProvider as I18nProvider } from "@/lib/testUtils/i18n";
import { ApiClientError } from "@/lib/api";
import type { StudentResult } from "shared";

expect.extend(toHaveNoViolations);

const mockNotFound = jest.fn();
jest.mock("next/navigation", () => ({
  notFound: () => {
    mockNotFound();
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const mockApiRequest = jest.fn<Promise<unknown>, [string, RequestInit?, string?]>();
jest.mock("@/lib/api", () => ({
  ...mockCreateApiModule(true),
  apiRequest: (path: string, options?: RequestInit, baseUrlOverride?: string) =>
    mockApiRequest(path, options, baseUrlOverride),
}));

jest.mock("@/lib/analytics", () => ({
  trackResultOpened: jest.fn(),
  consumeSearchAttempts: jest.fn().mockReturnValue(0),
}));

// Imported after the mocks so it picks up the mocked modules.
import { ResultCardClient } from "../ResultCardClient";

const STUDENT: StudentResult = {
  slug: "abc123",
  examType: "bac",
  examYear: 2024,
  examNo: "00123",
  nameFr: "Ahmed Ould Mohamed",
  nameAr: null,
  serie: "SN",
  moyenne: "14.50",
  decision: "Admis",
  decisionRaw: "Admis",
};

// ResultCardClient throws during render for both notFound() and unexpected
// errors (by design — see its own comment), same as it would inside the
// route's real error.tsx/not-found.tsx boundaries in production. A minimal
// boundary here lets the test observe "it threw" without an actual uncaught
// exception failing the test run.
class TestBoundary extends Component<{ children: ReactNode }, { threw: boolean }> {
  state = { threw: false };
  static getDerivedStateFromError() {
    return { threw: true };
  }
  render() {
    return this.state.threw ? <div data-testid="boundary-caught" /> : this.props.children;
  }
}

function renderClient() {
  return render(
    <I18nProvider locale="fr">
      <TestBoundary>
        <ResultCardClient slug="abc123" lang="fr" />
      </TestBoundary>
    </I18nProvider>,
  );
}

beforeEach(() => {
  mockApiRequest.mockReset();
  mockNotFound.mockReset();
});

describe("ResultCardClient", () => {
  it("shows an accessible loading state, then the result card once the fetch resolves", async () => {
    mockApiRequest.mockResolvedValueOnce(STUDENT);

    renderClient();

    expect(screen.getByRole("status")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Ahmed Ould Mohamed")).toBeInTheDocument();
    });
    expect(mockApiRequest).toHaveBeenCalledWith("/api/results/abc123", undefined, undefined);
  });

  it("calls notFound() for a not-found result", async () => {
    mockApiRequest.mockRejectedValueOnce(new ApiClientError("STUDENT_NOT_FOUND", "No result found."));

    renderClient();

    await waitFor(() => {
      expect(mockNotFound).toHaveBeenCalled();
    });
  });

  it("shows a calm rate-limited message with the server-provided retry window, no card", async () => {
    mockApiRequest.mockRejectedValueOnce(new ApiClientError("RATE_LIMITED", "Too many requests.", 42));

    renderClient();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("42");
    });
    expect(screen.queryByText("Ahmed Ould Mohamed")).not.toBeInTheDocument();
  });

  it("re-throws an unexpected failure (network/5xx) for the route's error boundary", async () => {
    mockApiRequest.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    renderClient();

    await waitFor(() => {
      expect(screen.getByTestId("boundary-caught")).toBeInTheDocument();
    });
  });

  it("has no accessibility violations in the loading state", async () => {
    mockApiRequest.mockImplementation(() => new Promise(() => {}));

    const { container } = renderClient();

    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no accessibility violations once loaded", async () => {
    mockApiRequest.mockResolvedValueOnce(STUDENT);

    const { container } = renderClient();
    await waitFor(() => {
      expect(screen.getByText("Ahmed Ould Mohamed")).toBeInTheDocument();
    });

    expect(await axe(container)).toHaveNoViolations();
  });
});

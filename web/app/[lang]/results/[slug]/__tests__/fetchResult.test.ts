import { mockApiModule as mockCreateApiModule } from "@/lib/testUtils/mockApi";
import { ApiClientError, DEFAULT_RATE_LIMIT_RETRY_SECONDS } from "@/lib/api";
import type { StudentResult } from "shared";

const mockApiRequest = jest.fn<Promise<unknown>, [string, RequestInit?, string?]>();

jest.mock("@/lib/api", () => ({
  ...mockCreateApiModule(true),
  apiRequest: (path: string, options?: RequestInit, baseUrlOverride?: string) =>
    mockApiRequest(path, options, baseUrlOverride),
}));

// Imported after the mock so it picks up the mocked '@/lib/api'.
import { fetchResult } from "../fetchResult";

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

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  mockApiRequest.mockReset();
  process.env = { ...ORIGINAL_ENV, API_URL: "http://api:3001" };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("fetchResult", () => {
  it("returns an ok outcome with the student data on success", async () => {
    mockApiRequest.mockResolvedValueOnce(STUDENT);

    const outcome = await fetchResult("abc123");

    expect(outcome).toEqual({ kind: "ok", data: STUDENT });
    expect(mockApiRequest).toHaveBeenCalledWith(
      "/api/results/abc123",
      expect.objectContaining({ next: { revalidate: 3600 } }),
      "http://api:3001",
    );
  });


  it("returns not_found for STUDENT_NOT_FOUND without throwing", async () => {
    mockApiRequest.mockRejectedValueOnce(
      new ApiClientError("STUDENT_NOT_FOUND", "No result found."),
    );

    await expect(fetchResult("missing")).resolves.toEqual({ kind: "not_found" });
  });

  it("returns not_found for VALIDATION_ERROR (malformed slug) without throwing", async () => {
    mockApiRequest.mockRejectedValueOnce(
      new ApiClientError("VALIDATION_ERROR", "Invalid result identifier"),
    );

    await expect(fetchResult("!!!")).resolves.toEqual({ kind: "not_found" });
  });

  it("returns rate_limited with the server's Retry-After value, never throws", async () => {
    mockApiRequest.mockRejectedValueOnce(
      new ApiClientError("RATE_LIMITED", "Too many requests.", 42),
    );

    await expect(fetchResult("abc123")).resolves.toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 42,
    });
  });

  it("falls back to the default retry window when RATE_LIMITED has no Retry-After", async () => {
    mockApiRequest.mockRejectedValueOnce(
      new ApiClientError("RATE_LIMITED", "Too many requests."),
    );

    await expect(fetchResult("abc123")).resolves.toEqual({
      kind: "rate_limited",
      retryAfterSeconds: DEFAULT_RATE_LIMIT_RETRY_SECONDS,
    });
  });

  it("rethrows an unrecognized ApiClientError code as an unexpected failure", async () => {
    mockApiRequest.mockRejectedValueOnce(new ApiClientError("INTERNAL", "Internal error."));

    await expect(fetchResult("abc123")).rejects.toThrow("Internal error.");
  });

  it("rethrows a non-ApiClientError failure (e.g. network error) as unexpected", async () => {
    mockApiRequest.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(fetchResult("abc123")).rejects.toThrow("Failed to fetch");
  });
});

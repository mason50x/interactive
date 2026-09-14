import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  fetchMutation: vi.fn(),
  inviteUser: vi.fn(),
  list: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  clerkClient: async () => ({ invitations: { getInvitationList: mocks.list } }),
}));
vi.mock("@clerk/nextjs/errors", () => ({
  isClerkAPIResponseError: (error: unknown) =>
    Boolean(error && typeof error === "object" && "status" in error),
}));
vi.mock("convex/nextjs", () => ({ fetchMutation: mocks.fetchMutation }));
vi.mock("@/lib/server/invitations", () => ({ inviteUser: mocks.inviteUser }));
import { approveNomination } from "@/lib/server/voting-actions";
const id = "nomination-test" as Id<"nominations">;
afterEach(() => vi.unstubAllEnvs());

test("production cannot send voting invitations even with an admin session", async () => {
  vi.stubEnv("NODE_ENV", "production");
  expect(await approveNomination(id)).toEqual({
    ok: false,
    message: "Voting is not available.",
  });
  expect(mocks.auth).not.toHaveBeenCalled();
  expect(mocks.fetchMutation).not.toHaveBeenCalled();
  expect(mocks.inviteUser).not.toHaveBeenCalled();
});

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({
    userId: "admin",
    getToken: async () => "test-token",
  });
  mocks.fetchMutation
    .mockResolvedValueOnce({ email: "nominee@example.com", sent: false })
    .mockResolvedValue(null);
  mocks.list.mockResolvedValue({ data: [] });
  mocks.inviteUser.mockResolvedValue({ id: "invitation-test" });
});

test("admin approval sends using the existing invite helper and confirms delivery", async () => {
  expect(await approveNomination(id)).toMatchObject({ ok: true });
  expect(mocks.inviteUser).toHaveBeenCalledWith({
    emailAddress: "nominee@example.com",
    publicMetadata: { invitedBy: "admin", nominationId: id },
  });
  expect(mocks.fetchMutation).toHaveBeenLastCalledWith(
    expect.anything(),
    { nominationId: id, clerkInvitationId: "invitation-test" },
    { token: "test-token" },
  );
});

test("a retry reconciles an existing invitation instead of sending another email", async () => {
  mocks.list.mockResolvedValue({
    data: [
      {
        id: "existing",
        emailAddress: "nominee@example.com",
        status: "pending",
      },
    ],
  });
  expect(await approveNomination(id)).toMatchObject({ ok: true });
  expect(mocks.inviteUser).not.toHaveBeenCalled();
  expect(mocks.fetchMutation).toHaveBeenLastCalledWith(
    expect.anything(),
    { nominationId: id, clerkInvitationId: "existing" },
    { token: "test-token" },
  );
});

test("a failed permission check never reaches Clerk", async () => {
  mocks.fetchMutation
    .mockReset()
    .mockRejectedValue(new Error("Admin required"));
  expect(await approveNomination(id)).toMatchObject({ ok: false });
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.inviteUser).not.toHaveBeenCalled();
});

test("uncertain delivery retains the reservation for reconciliation", async () => {
  mocks.inviteUser.mockRejectedValue(new Error("Connection lost"));
  expect(await approveNomination(id)).toMatchObject({ ok: false });
  expect(mocks.fetchMutation).toHaveBeenCalledTimes(1);
});

test("a definitive Clerk refusal releases the reservation for retry", async () => {
  mocks.inviteUser.mockRejectedValue({ status: 422 });
  expect(await approveNomination(id)).toMatchObject({ ok: false });
  expect(mocks.fetchMutation).toHaveBeenCalledTimes(2);
});

test("a lost confirmation never releases an invitation that was already sent", async () => {
  mocks.fetchMutation
    .mockReset()
    .mockResolvedValueOnce({ email: "nominee@example.com", sent: false })
    .mockRejectedValue(new Error("Unavailable"));
  expect(await approveNomination(id)).toMatchObject({ ok: false });
  expect(mocks.inviteUser).toHaveBeenCalledTimes(1);
  expect(mocks.fetchMutation).toHaveBeenCalledTimes(2);
});

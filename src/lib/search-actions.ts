import { channel } from "@/lib/events";

export const signOutRequest = channel<void>("50x:sign-out-request");

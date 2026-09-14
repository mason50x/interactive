import { expect, test } from "vitest";
import { findPatterns } from "@convex/moderation/patterns";

const EMAIL = { rule: "email", category: "contact" };
const PHONE = { rule: "phone", category: "contact" };
const ADDRESS = { rule: "address", category: "location" };

test.each([
  "me@example.com",
  "ME@EXAMPLE.COM",
  "Me.Last+tag@Sub.Example.co.uk",
  "reach me at first_last%x@mail-host.org today",
])("an email address is contact details: %s", (body) => {
  expect(findPatterns(body)).toEqual([EMAIL]);
});

test.each([
  "call me at 555-123-4567",
  "CALL ME AT 555-123-4567",
  "call me at (555) 123-4567",
  "my number is +1 555 123 4567",
  "text me 5551234567",
  "phone: 555.123.4567",
  // Seven digits is the shortest run that counts.
  "my cell is 1234567",
  // Spaced groups are still a number once there is contact context.
  "my number 123 456 789",
])("a phone number next to contact context is contact details: %s", (body) => {
  expect(findPatterns(body)).toEqual([PHONE]);
});

test.each([
  // The same number with nothing saying it is a number to call.
  "555-123-4567",
  "5551234567",
  // Contact context, but too few or too many digits to be a phone number.
  "call me at 12345",
  "call me at 1234567890123456",
  // Contact words with no number at all.
  "call me maybe",
])("numbers without contact context are ordinary text: %s", (body) => {
  expect(findPatterns(body)).toEqual([]);
});

test.each([
  "123 Main Street",
  "42 Oak Avenue",
  "9 Elm Rd",
  "1600 Pennsylvania Ave NW",
  "i live at 77 north maple lane ok",
  "17 St James Place",
])("a street address is a location: %s", (body) => {
  expect(findPatterns(body)).toEqual([ADDRESS]);
});

test.each([
  // A street with no number, and a number with no street.
  "Main Street",
  "123 Main",
  "the street was empty",
  "i scored 100 points on that level",
])("street words without a numbered address are ordinary text: %s", (body) => {
  expect(findPatterns(body)).toEqual([]);
});

test.each([
  "123 456 789",
  "run 3",
  "chapter 12",
  "https://example.com/movie",
  "see example.com/movie for the trailer",
  // Not an email: no dot after the host.
  "user@localhost",
  "the score was 21-17 on 2024-01-05",
  "movie night at 8",
  "",
])("must not match: %s", (body) => {
  expect(findPatterns(body)).toEqual([]);
});

test("several kinds of detail are all reported, email first", () => {
  expect(findPatterns("me@example.com, 123 Main Street, call me 555-123-4567"))
    .toEqual([EMAIL, ADDRESS, PHONE]);
});

test("one phone hit per message, however many numbers it has", () => {
  const hits = findPatterns("call me at 555-123-4567 or 555-765-4321");
  expect(hits).toEqual([PHONE]);
});

# M4 Injection-Vector Test Patterns

Required patterns for W1+/W2+ wave agents writing e2e and unit tests.
Every input field, URL parameter, and API payload must include at least one
vector from each category below.

---

## 1. NUL byte injection

NUL bytes (`\x00`) truncate C-string parsers and can bypass prefix/suffix
validation. Supabase's Postgres driver is safe, but middleware and logging
pipelines may not be.

**Test pattern (unit — trip name field):**

```typescript
it("rejects trip names containing NUL bytes", async () => {
  const result = await createTrip({ name: "M4 trip\x00injected" });
  expect(result.error).toMatch(/invalid/i);
});
```

**Test pattern (e2e — trip name input):**

```typescript
test("trip name input strips NUL bytes before submission", async ({ page }) => {
  await page.fill('[data-testid="trip-name-input"]', "M4 trip\x00injected");
  await page.click('[data-testid="create-trip-submit"]');
  // Must not create a trip with a NUL in the stored name
  const stored = await page.locator('[data-testid="trip-name"]').textContent();
  expect(stored).not.toContain("\x00");
});
```

---

## 2. CRLF injection

CRLF (`\r\n`) in a field that gets echoed into an HTTP header (e.g. redirect
URL, cookie value, or Content-Disposition) enables header injection. Check any
field surfaced in a `Location:` or `Set-Cookie:` header.

**Test pattern (unit — invite redirect URL):**

```typescript
it("rejects redirect URLs with CRLF sequences", () => {
  const malicious = "http://localhost/trips/123\r\nSet-Cookie: evil=1";
  expect(() => validateRedirectUrl(malicious)).toThrow();
});
```

**Test pattern (e2e — magic-link redirect):**

```typescript
test("magic-link redirect ignores CRLF in next param", async ({ page }) => {
  // Manually craft a URL with CRLF in the `next` query param
  await page.goto("/login?next=%2Ftrips%2F123%0D%0ASet-Cookie%3A+evil%3D1");
  await page.waitForURL(/\/trips\/123|\/login/);
  // Must NOT set an "evil" cookie
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === "evil")).toBeUndefined();
});
```

---

## 3. Oversized strings

Postgres `varchar(n)` truncates silently in some driver versions; unbounded
`text` accepts arbitrarily large inputs. Both cases need coverage:
- Field-level: 1 char over the DB column limit.
- Payload-level: a 1 MB string that should be rejected at the API layer, not
  stored.

**Test pattern (unit — display_name column, limit 100):**

```typescript
it("rejects display_name longer than 100 characters", async () => {
  const longName = "A".repeat(101);
  const result = await updateProfile({ displayName: longName });
  expect(result.error).toBeDefined();
});

it("accepts display_name exactly 100 characters", async () => {
  const maxName = "A".repeat(100);
  const result = await updateProfile({ displayName: maxName });
  expect(result.error).toBeNull();
});
```

**Test pattern (e2e — server action body):**

```typescript
test("API rejects requests with bodies over 1 MB", async ({ request }) => {
  const response = await request.post("/api/trips", {
    data: { name: "X".repeat(1_048_577) }, // 1 MB + 1 byte
  });
  expect(response.status()).toBe(413);
});
```

---

## 4. Non-IATA airline codes

The itinerary travel-legs table stores `airline_code`. Valid IATA codes are
2–3 uppercase alphanumeric characters. Tests must cover invalid formats that
a UI dropdown would normally prevent but the API must also reject.

**Test pattern (unit — travel leg creation):**

```typescript
const invalidCodes = [
  "",           // empty
  "A",          // too short
  "ABCD",       // too long (4 chars)
  "A1B2",       // too long
  "a1",         // lowercase
  "  ",         // whitespace only
  "A\x00B",    // NUL embedded
  "AA\nBB",    // CRLF embedded
];

it.each(invalidCodes)("rejects airline code %j", async (code) => {
  const result = await createTravelLeg({ airlineCode: code, flightNumber: "123" });
  expect(result.error).toMatch(/invalid.*airline/i);
});

it("accepts valid 2-char IATA code", async () => {
  const result = await createTravelLeg({ airlineCode: "AA", flightNumber: "100" });
  expect(result.error).toBeNull();
});

it("accepts valid 3-char IATA code", async () => {
  const result = await createTravelLeg({ airlineCode: "AAL", flightNumber: "100" });
  expect(result.error).toBeNull();
});
```

---

## 5. Non-UUID session tokens

Supabase session tokens in URL params (e.g. invite tokens, magic-link codes)
must be validated before use. Passing non-UUID strings must not cause unhandled
exceptions or expose internal error details to the client.

**Test pattern (unit — invite token lookup):**

```typescript
const nonUuidTokens = [
  "",                             // empty
  "not-a-uuid",                   // obviously invalid
  "' OR 1=1--",                   // SQL injection attempt
  "<script>alert(1)</script>",    // XSS attempt
  "../../etc/passwd",             // path traversal
  "a".repeat(1000),               // oversized
];

it.each(nonUuidTokens)("rejects invite token %j with 400", async (token) => {
  const response = await invitePreview(token);
  expect(response.status).toBe(400);
  // Must not leak stack trace or internal error messages
  expect(response.body).not.toMatch(/supabase|postgres|stack/i);
});
```

**Test pattern (e2e — /invite/[token] route):**

```typescript
test("non-UUID invite token shows user-friendly error page", async ({ page }) => {
  await page.goto("/invite/not-a-real-token");
  // Must show an error UI, not crash with a 500
  await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
  await expect(page).not.toHaveURL(/500|error/);
});
```

---

## Checklist for W1+/W2+ agents

Before marking a feature complete, confirm each of these test variants exists
for every user-supplied string field or token:

- [ ] NUL byte in input rejects or strips cleanly
- [ ] CRLF sequence in any field echoed into HTTP headers is rejected
- [ ] Oversized input is rejected at the API layer (not only in the DB)
- [ ] Domain-specific format validation (IATA, UUID, email, phone E.164) covers
      boundary cases and obviously-invalid inputs
- [ ] Non-UUID tokens in URL params return 400 with a safe error body

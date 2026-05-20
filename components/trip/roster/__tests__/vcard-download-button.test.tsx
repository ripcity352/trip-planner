/**
 * Unit tests for VCardDownloadButton — "use client" component.
 * TDD: written before implementation.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VCardDownloadButton } from "../vcard-download-button";

// ── Browser API mocks ────────────────────────────────────────────────────────

const mockCreateObjectURL = vi.fn((blob: Blob) => `blob:http://localhost/fake-url-${blob.size}`);
const mockRevokeObjectURL = vi.fn((url: string) => url);

// Track the last anchor created by the component
let lastAnchor: {
  href: string;
  download: string;
  click: ReturnType<typeof vi.fn>;
} | null = null;

beforeEach(() => {
  vi.restoreAllMocks();
  mockCreateObjectURL.mockReset().mockReturnValue("blob:http://localhost/fake-url-42");
  mockRevokeObjectURL.mockReset();
  lastAnchor = null;

  // jsdom doesn't implement URL.createObjectURL
  Object.defineProperty(globalThis, "URL", {
    configurable: true,
    writable: true,
    value: {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    },
  });

  // Intercept anchor creation without recursing: override the prototype method
  // directly rather than spying on createElement (which recurses because
  // React itself calls createElement for non-"a" tags during render).
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string, options?: ElementCreationOptions) => {
    const el = originalCreateElement(tag, options);
    if (tag === "a") {
      lastAnchor = {
        href: "",
        download: "",
        click: vi.fn(),
      };
      // Redirect property writes so we can inspect them
      Object.defineProperty(el, "href", {
        get: () => lastAnchor!.href,
        set: (v: string) => { lastAnchor!.href = v; },
        configurable: true,
      });
      Object.defineProperty(el, "download", {
        get: () => lastAnchor!.download,
        set: (v: string) => { lastAnchor!.download = v; },
        configurable: true,
      });
      el.click = lastAnchor.click as unknown as () => void;
    }
    return el;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const sampleMembers = [
  { name: "John Doe", phone: "+15555550100" },
  { name: "Jane Smith", phone: "+15555550101" },
];

describe("VCardDownloadButton", () => {
  it("renders the CTA label from M3_UI_STRINGS", () => {
    render(<VCardDownloadButton members={sampleMembers} tripName="Test Trip" />);
    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(screen.getByText("Download contacts")).toBeInTheDocument();
  });

  it("is disabled when members array is empty", () => {
    render(<VCardDownloadButton members={[]} tripName="Empty Trip" />);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
  });

  it("is not disabled when members have phone numbers", () => {
    render(<VCardDownloadButton members={sampleMembers} tripName="Test Trip" />);
    const btn = screen.getByRole("button");
    expect(btn).not.toBeDisabled();
  });

  it("calls URL.createObjectURL with a Blob on click", () => {
    render(<VCardDownloadButton members={sampleMembers} tripName="Test Trip" />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(mockCreateObjectURL).toHaveBeenCalledOnce();
    const blob = mockCreateObjectURL.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
  });

  it("sets the Blob MIME type to text/vcard", () => {
    render(<VCardDownloadButton members={sampleMembers} tripName="Test Trip" />);
    fireEvent.click(screen.getByRole("button"));
    const blob = mockCreateObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe("text/vcard");
  });

  it("triggers an anchor click to initiate download", () => {
    render(<VCardDownloadButton members={sampleMembers} tripName="Test Trip" />);
    fireEvent.click(screen.getByRole("button"));
    expect(lastAnchor?.click).toHaveBeenCalledOnce();
  });

  it("sets the download filename from tripName", () => {
    render(
      <VCardDownloadButton members={sampleMembers} tripName="Vegas Bach" />
    );
    fireEvent.click(screen.getByRole("button"));
    expect(lastAnchor?.download).toBe("vegas-bach-contacts.vcf");
  });

  it("revokes the object URL after download to free memory", () => {
    render(<VCardDownloadButton members={sampleMembers} tripName="Test Trip" />);
    fireEvent.click(screen.getByRole("button"));
    expect(mockRevokeObjectURL).toHaveBeenCalledOnce();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/fake-url-42");
  });

  it("has tap target height >= 44px (min-h-11 class)", () => {
    render(<VCardDownloadButton members={sampleMembers} tripName="Test Trip" />);
    const btn = screen.getByRole("button");
    expect(btn.className).toMatch(/min-h-11|h-11|h-12/);
  });
});

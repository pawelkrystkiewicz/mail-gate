import { describe, expect, test } from "bun:test";
import { parseMailgunFormData, mailgunToInternal } from "../src/core/transformer";

describe("parseMailgunFormData", () => {
  test("parses basic form data", () => {
    const formData = new FormData();
    formData.append("from", "sender@example.com");
    formData.append("to", "recipient@example.com");
    formData.append("subject", "Test Subject");
    formData.append("html", "<p>Hello</p>");
    formData.append("text", "Hello");

    const result = parseMailgunFormData(formData);

    expect(result.from).toBe("sender@example.com");
    expect(result.to).toEqual(["recipient@example.com"]);
    expect(result.subject).toBe("Test Subject");
    expect(result.html).toBe("<p>Hello</p>");
    expect(result.text).toBe("Hello");
  });

  test("parses multiple recipients", () => {
    const formData = new FormData();
    formData.append("from", "sender@example.com");
    formData.append("to", "one@example.com");
    formData.append("to", "two@example.com");
    formData.append("subject", "Test");

    const result = parseMailgunFormData(formData);

    expect(result.to).toEqual(["one@example.com", "two@example.com"]);
  });

  test("parses comma-separated recipients", () => {
    const formData = new FormData();
    formData.append("from", "sender@example.com");
    formData.append("to", "one@example.com, two@example.com");
    formData.append("subject", "Test");

    const result = parseMailgunFormData(formData);

    expect(result.to).toEqual(["one@example.com", "two@example.com"]);
  });

  test("parses tags", () => {
    const formData = new FormData();
    formData.append("from", "sender@example.com");
    formData.append("to", "recipient@example.com");
    formData.append("subject", "Test");
    formData.append("o:tag", "newsletter");
    formData.append("o:tag", "ghost-email");

    const result = parseMailgunFormData(formData);

    expect(result.tags).toEqual(["newsletter", "ghost-email"]);
  });

  test("parses tracking options", () => {
    const formData = new FormData();
    formData.append("from", "sender@example.com");
    formData.append("to", "recipient@example.com");
    formData.append("subject", "Test");
    formData.append("o:tracking-clicks", "yes");
    formData.append("o:tracking-opens", "yes");

    const result = parseMailgunFormData(formData);

    expect(result.trackingClicks).toBe(true);
    expect(result.trackingOpens).toBe(true);
  });

  test("parses recipient variables", () => {
    const formData = new FormData();
    formData.append("from", "sender@example.com");
    formData.append("to", "user@example.com");
    formData.append("subject", "Test");
    formData.append(
      "recipient-variables",
      JSON.stringify({
        "user@example.com": { name: "User", id: 1 },
      })
    );

    const result = parseMailgunFormData(formData);

    expect(result.recipientVariables).toEqual({
      "user@example.com": { name: "User", id: 1 },
    });
  });
});

describe("mailgunToInternal", () => {
  test("converts to internal format without recipient variables", () => {
    const request = {
      from: "sender@example.com",
      to: ["one@example.com", "two@example.com"],
      subject: "Test",
      html: "<p>Hello</p>",
    };

    const result = mailgunToInternal(request);

    expect(result).toHaveLength(1);
    expect(result[0]!.to).toEqual(["one@example.com", "two@example.com"]);
  });

  test("splits into individual emails with recipient variables", () => {
    const request = {
      from: "sender@example.com",
      to: ["one@example.com", "two@example.com"],
      subject: "Test",
      html: "<p>Hello %recipient.name%</p>",
      recipientVariables: {
        "one@example.com": { name: "One" },
        "two@example.com": { name: "Two" },
      },
    };

    const result = mailgunToInternal(request);

    expect(result).toHaveLength(2);
    expect(result[0]!.to).toEqual(["one@example.com"]);
    expect(result[0]!.html).toBe("<p>Hello One</p>");
    expect(result[1]!.to).toEqual(["two@example.com"]);
    expect(result[1]!.html).toBe("<p>Hello Two</p>");
  });
});

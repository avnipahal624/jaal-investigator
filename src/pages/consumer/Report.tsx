import { useState, useCallback, useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import {
  MessageSquare,
  Phone,
  Receipt,
  Link,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Upload,
  Trash2,
  CheckCircle2,
  ArrowRight,
  Shield,
  Loader2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { ConsumerCategoryKey } from "@/convex/_generated/dataModel";
import type { Investigation } from "@/convex/_generated/dataModel";

const CATEGORIES = [
  {
    key: "message" as const,
    label: "Suspicious Message",
    description: "A text, chat or email that felt off.",
    icon: MessageSquare,
  },
  {
    key: "call" as const,
    label: "Suspicious Phone Call",
    description: "A call that asked for money or personal details.",
    icon: Phone,
  },
  {
    key: "payment" as const,
    label: "Payment Request",
    description: "A request to send money or a payment link.",
    icon: Receipt,
  },
  {
    key: "link" as const,
    label: "Suspicious Link",
    description: "A link that looked strange or unexpected.",
    icon: Link,
  },
  {
    key: "other" as const,
    label: "Something Else",
    description: "Anything else that felt suspicious.",
    icon: HelpCircle,
  },
];

type Step = "category" | "details" | "review" | "success";

const FILE_MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
];

export default function ConsumerReportPage() {
  const [searchParams] = useSearchParams();

  const preselectedCategory = (searchParams.get("category") as ConsumerCategoryKey | null) ?? null;

  const [step, setStep] = useState<Step>(
    preselectedCategory ? "details" : "category",
  );
  const [category, setCategory] = useState<ConsumerCategoryKey | null>(
    preselectedCategory ?? null,
  );
  const [selected, setSelected] = useState<string | number | null>(
    preselectedCategory ? preselectedCategory : null,
  );

  // Form fields per category
  const [messageText, setMessageText] = useState("");
  const [conversationText, setConversationText] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [callDescription, setCallDescription] = useState("");
  const [upiId, setUpiId] = useState("");
  const [paymentDetails, setPaymentDetails] = useState("");
  const [amount, setAmount] = useState("");
  const [url, setUrl] = useState("");
  const [urlWhereReceived, setUrlWhereReceived] = useState("");
  const [otherDescription, setOtherDescription] = useState("");

  // Attachment
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentLabel, setAttachmentLabel] = useState("");
  const [attachmentText, setAttachmentText] = useState("");
  const [attachmentProgress, setAttachmentProgress] = useState(0);
  const [attachmentStatus, setAttachmentStatus] = useState<
    "idle" | "uploading" | "ready" | "error"
  >("idle");
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Investigation | null>(null);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [attention, setAttention] = useState<string | null>(null);



  const resetAttachment = () => {
    setAttachmentFile(null);
    setAttachmentLabel("");
    setAttachmentText("");
    setAttachmentProgress(0);
    setAttachmentStatus("idle");
    setAttachmentError(null);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;

    if (file.size > FILE_MAX_BYTES) {
      setAttachmentError(
        "File is too large. Please upload up to 4MB.",
      );
      setAttachmentStatus("error");
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      setAttachmentError(
        "Unsupported file type. Please use PNG, JPEG, WebP or PDF.",
      );
      setAttachmentStatus("error");
      return;
    }

    setAttachmentFile(file);
    setAttachmentLabel(file.name);
    setAttachmentError(null);
    setAttachmentStatus("ready");
  };

  const simulateUpload = useCallback(() => {
    if (!attachmentFile) return;
    setAttachmentStatus("uploading");
    setAttachmentProgress(0);
    let progress = 0;
    const timer = setInterval(() => {
      progress += Math.floor(Math.random() * 25) + 10;
      if (progress >= 100) {
        progress = 100;
        clearInterval(timer);
        setAttachmentProgress(100);
        setAttachmentStatus("ready");
      } else {
        setAttachmentProgress(progress);
      }
    }, 180);
    return timer;
  }, [attachmentFile]);

  const startAttachment = useCallback(() => {
    if (!attachmentFile) return;
    const timer = simulateUpload();
    // Clean up if user navigates away (rough).
    return timer;
  }, [attachmentFile, simulateUpload]);

  useEffect(() => {
    if (attachmentFile && attachmentStatus === "ready") {
      const timer = startAttachment();
      return () => clearInterval(timer);
    }
  }, [attachmentFile, attachmentStatus, startAttachment]);

  const previewCategory = CATEGORIES.find(
    (c) => c.key === category,
  );

  const showMessageFields = category === "message";
  const showCallFields = category === "call";
  const showPaymentFields = category === "payment";
  const showLinkFields = category === "link";
  const showOtherFields = category === "other";

  const validateDetails = (): string | null => {
    if (!category) return "Please choose what you want to report.";
    if (showMessageFields && !messageText.trim()) {
      return "Please share the suspicious message.";
    }
    if (showCallFields && !phoneNumber.trim()) {
      return "Please share the phone number.";
    }
    if (showCallFields && !callDescription.trim()) {
      return "Please describe the call briefly.";
    }
    if (showPaymentFields && !upiId.trim() && !paymentDetails.trim()) {
      return "Please share at least the UPI ID or payment details.";
    }
    if (showLinkFields && !url.trim()) {
      return "Please share the link.";
    }
    if (showOtherFields && !otherDescription.trim()) {
      return "Please describe what happened.";
    }
    return null;
  };

  const handleCategorySelect = (item: (typeof CATEGORIES)[number]) => {
    setCategory(item.key);
    setSelected(item.key);
    setStep("details");
    setSubmitError(null);
  };

  const handleBack = () => {
    if (step === "details") setStep("category");
    else if (step === "review") setStep("details");
  };

  const handleSubmit = async () => {
    if (!category) return;
    if (!privacyAccepted) {
      setAttention("Please read and accept the privacy notice to continue.");
      setTimeout(() => setAttention(null), 4000);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setAttention(null);

    try {
      const result = await api.consumer.createConsumerReport({
        category: category,
        messageText: messageText || undefined,
        conversationText: conversationText || undefined,
        phoneNumber: phoneNumber || undefined,
        callDescription: callDescription || undefined,
        upiId: upiId || undefined,
        paymentDetails: paymentDetails || undefined,
        amount: amount || undefined,
        url: url || undefined,
        urlWhereReceived: urlWhereReceived || undefined,
        description: otherDescription || undefined,
        attachmentLabel: attachmentLabel || undefined,
        attachmentText: attachmentText || undefined,
      });

      setSubmitted(result.report);
      setStep("success");
    } catch (error) {
      console.error("createConsumerReport error:", error);
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Could not submit your report. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (ts?: number | null) => {
    if (!ts) return "Just now";
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const categoryTitle = previewCategory?.label ?? "Report";
  const categoryDescription = previewCategory?.description ?? "";

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-[var(--color-consumer-deep)]">
          Report a Scam
        </h1>
        <p className="mt-1 text-[var(--color-consumer-muted)]">
          Tell us what happened. We will check it and show you what to look
          out for.
        </p>
      </header>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 mb-8 text-sm" role="list" aria-label="Report steps">
        {(["category", "details", "review"] as const).map((s, i) => {
          const label = s === "category" ? "What to report" : s === "details" ? "Your details" : "Review";
          const done = ["category", "details", "review"].indexOf(step as string) > ["category", "details", "review"].indexOf(s);
          return (
            <div key={s} className="flex items-center gap-2" role="listitem">
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                  step === s
                    ? "bg-[var(--color-consumer-primary)] text-white"
                    : done
                    ? "bg-[var(--color-consumer-teal)] text-white"
                    : "bg-[var(--color-consumer-border)] text-[var(--color-consumer-muted)]"
                }`}
              >
                {done ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <span className="w-4 h-4 flex items-center justify-center">
                    {i + 1}
                  </span>
                )}
              </span>
              <span
                className={`${
                  step === s ? "text-[var(--color-consumer-deep)] font-medium" : "text-[var(--color-consumer-muted)]"
                }`}
              >
                {label}
              </span>
              {i < 2 && <ChevronRight className="w-4 h-4 text-[var(--color-consumer-border)]" />}
            </div>
          );
        })}
      </div>

      {/* Step 1: category */}
      {step === "category" && (
        <section aria-labelledby="category-title">
          <h2
            id="category-title"
            className="text-lg font-semibold text-[var(--color-consumer-deep)] mb-4"
          >
            What would you like to report?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {CATEGORIES.map((item) => {
              const Icon = item.icon;
              const selectedCat = selected === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleCategorySelect(item)}
                  className={`tile flex-row justify-between h-auto min-h-[88px] gap-4 ${
                    selectedCat ? "active" : ""
                  }`}
                  aria-pressed={selectedCat}
                >
                  <span className="flex items-start gap-3 min-w-0">
                    <span className="tile-icon shrink-0" aria-hidden="true">
                      <Icon
                        className={`w-5 h-5 ${
                          selectedCat ? "text-white" : "text-[var(--color-consumer-primary)]"
                        }`}
                        strokeWidth={1.85}
                      />
                    </span>
                    <div>
                      <p className={`tile-label text-sm ${selectedCat ? "text-white" : ""}`}>
                        {item.label}
                      </p>
                      <p className="text-xs mt-0.5 opacity-80">
                        {item.description}
                      </p>
                    </div>
                  </span>
                  {selectedCat && (
                    <span className="shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center" aria-hidden="true">
                      <ChevronRight className="w-5 h-5 text-white" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Step 2: details */}
      {step === "details" && previewCategory && (
        <section aria-labelledby="details-title">
          <h2
            id="details-title"
            className="text-lg font-semibold text-[var(--color-consumer-deep)] mb-1"
          >
            Share the details
          </h2>
          <p className="text-sm text-[var(--color-consumer-muted)] mb-5">
            {categoryDescription}
          </p>

          <div className="glass-strong p-6 shadow-md space-y-5">
            {/* Shared: optional attachment */}
            {["message", "call", "payment", "link", "other"].includes(category) && (
              <div className="rounded-xl border border-[var(--color-consumer-border)] bg-[var(--color-consumer-glass)] p-4">
                <label
                  htmlFor="attachment"
                  className="flex items-center gap-2 text-sm font-medium text-[var(--color-consumer-text)] cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-[var(--color-consumer-primary)]" />
                  Attachments (optional)
                  <span className="text-[var(--color-consumer-muted)] text-xs ml-auto">
                    PNG, JPEG, WebP or PDF, up to 4MB
                  </span>
                </label>
                <input
                  id="attachment"
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.pdf"
                  className="mt-2 hidden"
                  onChange={handleFileChange}
                  aria-describedby="attachment-help"
                />
                <p id="attachment-help" className="text-xs text-[var(--color-consumer-muted)]">
                  We store your attachment as submitted evidence. We never
                  open or run the contents.
                </p>

                {attachmentStatus === "idle" && (
                  <div className="mt-2 text-sm text-[var(--color-consumer-muted)] italic">
                    No file selected yet.
                  </div>
                )}

                {attachmentStatus === "uploading" && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--color-consumer-text)] font-medium">
                        {attachmentLabel}
                      </span>
                      <span className="text-[var(--color-consumer-muted)]">
                        {attachmentProgress}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--color-consumer-border)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--color-consumer-primary)] transition-all"
                        style={{ width: `${attachmentProgress}%` }}
                        role="progressbar"
                        aria-valuenow={attachmentProgress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      />
                    </div>
                  </div>
                )}

                {attachmentStatus === "ready" && (
                  <div className="mt-2 flex items-center justify-between rounded-xl bg-[var(--color-consumer-mint)] border border-[var(--color-consumer-border)] px-3 py-2">
                    <span className="text-sm text-[var(--color-consumer-deep)]">
                      <CheckCircle2 className="w-4 h-4 inline mr-1.5 text-[var(--color-consumer-teal)]" />
                      {attachmentLabel}
                    </span>
                    <button
                      type="button"
                      className="text-[var(--color-consumer-muted)] hover:text-[var(--color-consumer-teal)]"
                      onClick={resetAttachment}
                      aria-label={`Remove ${attachmentLabel}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {attachmentStatus === "error" && (
                  <div className="mt-2 text-sm text-[var(--color-consumer-teal)] bg-[var(--color-consumer-mint)] rounded-xl p-3 border border-[var(--color-consumer-border)]">
                    {attachmentError}
                  </div>
                )}
              </div>
            )}

            {/* Message fields */}
            {showMessageFields && (
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="messageText"
                    className="block text-sm font-medium text-[var(--color-consumer-text)] mb-1"
                  >
                    Message text
                    <span className="text-[var(--color-consumer-muted)] font-normal">
                      {" "}
                      (required)
                    </span>
                  </label>
                  <textarea
                    id="messageText"
                    rows={4}
                    className="w-full rounded-xl border border-[var(--color-consumer-border)] bg-white px-4 py-3 text-sm text-[var(--color-consumer-text)] placeholder:text-[var(--color-consumer-muted)] focus:border-[var(--color-consumer-primary)] focus:ring-0 resize-y"
                    placeholder="Paste or type the message you received."
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    aria-describedby="message-help"
                  />
                  <p id="message-help" className="mt-1 text-xs text-[var(--color-consumer-muted)]">
                    Share the message in your own words. Don't include anything
                    you are not comfortable sharing.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="conversationText"
                    className="block text-sm font-medium text-[var(--color-consumer-text)] mb-1"
                  >
                    Conversation
                    <span className="text-[var(--color-consumer-muted)] font-normal">
                      {" "}
                      (optional)
                    </span>
                  </label>
                  <textarea
                    id="conversationText"
                    rows={3}
                    className="w-full rounded-xl border border-[var(--color-consumer-border)] bg-white px-4 py-3 text-sm text-[var(--color-consumer-text)] placeholder:text-[var(--color-consumer-muted)] focus:border-[var(--color-consumer-primary)] focus:ring-0 resize-y"
                    placeholder="Any earlier messages in the same conversation."
                    value={conversationText}
                    onChange={(e) => setConversationText(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Call fields */}
            {showCallFields && (
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="phoneNumber"
                    className="block text-sm font-medium text-[var(--color-consumer-text)] mb-1"
                  >
                    Phone number
                    <span className="text-[var(--color-consumer-muted)] font-normal">
                      {" "}
                      (required)
                    </span>
                  </label>
                  <input
                    id="phoneNumber"
                    type="tel"
                    className="w-full rounded-xl border border-[var(--color-consumer-border)] bg-white px-4 py-3 text-sm text-[var(--color-consumer-text)] placeholder:text-[var(--color-consumer-muted)] focus:border-[var(--color-consumer-primary)] focus:ring-0"
                    placeholder="The number that called you."
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    aria-describedby="phone-help"
                  />
                  <p id="phone-help" className="mt-1 text-xs text-[var(--color-consumer-muted)]">
                    This is stored as submitted information only and is not
                    independently verified.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="callDescription"
                    className="block text-sm font-medium text-[var(--color-consumer-text)] mb-1"
                  >
                    What happened in the call
                    <span className="text-[var(--color-consumer-muted)] font-normal">
                      {" "}
                      (required)
                    </span>
                  </label>
                  <textarea
                    id="callDescription"
                    rows={3}
                    className="w-full rounded-xl border border-[var(--color-consumer-border)] bg-white px-4 py-3 text-sm text-[var(--color-consumer-text)] placeholder:text-[var(--color-consumer-muted)] focus:border-[var(--color-consumer-primary)] focus:ring-0 resize-y"
                    placeholder="What the caller said and what they asked you to do."
                    value={callDescription}
                    onChange={(e) => setCallDescription(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Payment fields */}
            {showPaymentFields && (
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="upiId"
                    className="block text-sm font-medium text-[var(--color-consumer-text)] mb-1"
                  >
                    UPI ID
                    <span className="text-[var(--color-consumer-muted)] font-normal">
                      {" "}
                      (if available)
                    </span>
                  </label>
                  <input
                    id="upiId"
                    type="text"
                    className="w-full rounded-xl border border-[var(--color-consumer-border)] bg-white px-4 py-3 text-sm text-[var(--color-consumer-text)] placeholder:text-[var(--color-consumer-muted)] focus:border-[var(--color-consumer-primary)] focus:ring-0"
                    placeholder="Example: name@bank"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    aria-describedby="upi-help"
                  />
                  <p id="upi-help" className="mt-1 text-xs text-[var(--color-consumer-muted)]">
                    Stored as submitted information only.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="amount"
                      className="block text-sm font-medium text-[var(--color-consumer-text)] mb-1"
                    >
                      Amount
                      <span className="text-[var(--color-consumer-muted)] font-normal">
                        {" "}
                        (if known)
                      </span>
                    </label>
                    <input
                      id="amount"
                      type="text"
                      className="w-full rounded-xl border border-[var(--color-consumer-border)] bg-white px-4 py-3 text-sm text-[var(--color-consumer-text)] placeholder:text-[var(--color-consumer-muted)] focus:border-[var(--color-consumer-primary)] focus:ring-0"
                      placeholder="Example: ₹2,400"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="paymentDetails"
                      className="block text-sm font-medium text-[var(--color-consumer-text)] mb-1"
                    >
                      Payment details
                      <span className="text-[var(--color-consumer-muted)] font-normal">
                        {" "}
                        (optional)
                      </span>
                    </label>
                    <input
                      id="paymentDetails"
                      type="text"
                      className="w-full rounded-xl border border-[var(--color-consumer-border)] bg-white px-4 py-3 text-sm text-[var(--color-consumer-text)] placeholder:text-[var(--color-consumer-muted)] focus:border-[var(--color-consumer-primary)] focus:ring-0"
                      placeholder="How they asked you to pay."
                      value={paymentDetails}
                      onChange={(e) => setPaymentDetails(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Link fields */}
            {showLinkFields && (
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="url"
                    className="block text-sm font-medium text-[var(--color-consumer-text)] mb-1"
                  >
                    Link
                    <span className="text-[var(--color-consumer-muted)] font-normal">
                      {" "}
                      (required)
                    </span>
                  </label>
                  <input
                    id="url"
                    type="url"
                    className="w-full rounded-xl border border-[var(--color-consumer-border)] bg-white px-4 py-3 text-sm text-[var(--color-consumer-text)] placeholder:text-[var(--color-consumer-muted)] focus:border-[var(--color-consumer-primary)] focus:ring-0"
                    placeholder="https://example.com/..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    aria-describedby="url-help"
                  />
                  <p id="url-help" className="mt-1 text-xs text-[var(--color-consumer-muted)]">
                    We store the link exactly as you shared it. We do not open
                    it or visit it for you.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="urlWhereReceived"
                    className="block text-sm font-medium text-[var(--color-consumer-text)] mb-1"
                  >
                    Where did you receive it?
                    <span className="text-[var(--color-consumer-muted)] font-normal">
                      {" "}
                      (optional)
                    </span>
                  </label>
                  <input
                    id="urlWhereReceived"
                    type="text"
                    className="w-full rounded-xl border border-[var(--color-consumer-border)] bg-white px-4 py-3 text-sm text-[var(--color-consumer-text)] placeholder:text-[var(--color-consumer-muted)] focus:border-[var(--color-consumer-primary)] focus:ring-0"
                    placeholder="Example: WhatsApp message, SMS, email"
                    value={urlWhereReceived}
                    onChange={(e) => setUrlWhereReceived(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Other fields */}
            {showOtherFields && (
              <div>
                <label
                  htmlFor="otherDescription"
                  className="block text-sm font-medium text-[var(--color-consumer-text)] mb-1"
                >
                  What happened?
                  <span className="text-[var(--color-consumer-muted)] font-normal">
                    {" "}
                    (required)
                  </span>
                </label>
                <textarea
                  id="otherDescription"
                  rows={4}
                  className="w-full rounded-xl border border-[var(--color-consumer-border)] bg-white px-4 py-3 text-sm text-[var(--color-consumer-text)] placeholder:text-[var(--color-consumer-muted)] focus:border-[var(--color-consumer-primary)] focus:ring-0 resize-y"
                  placeholder="Describe what happened in your own words. Include any details that feel important."
                  value={otherDescription}
                  onChange={(e) => setOtherDescription(e.target.value)}
                  aria-describedby="other-help"
                />
                <p id="other-help" className="mt-1 text-xs text-[var(--color-consumer-muted)]">
                  Only share what you are comfortable sharing. You are not
                  required to name anyone.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-consumer-muted)] hover:text-[var(--color-consumer-text)] transition-colors"
                onClick={handleBack}
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  const v = validateDetails();
                  if (v) {
                    setAttention(v);
                    setTimeout(() => setAttention(null), 4000);
                    return;
                  }
                  setStep("review");
                  setSubmitError(null);
                }}
                className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm shadow-md hover:shadow-lg transition-shadow"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Step 3: review */}
      {step === "review" && previewCategory && (
        <section aria-labelledby="review-title">
          <h2
            id="review-title"
            className="text-lg font-semibold text-[var(--color-consumer-deep)] mb-1"
          >
            Review and submit
          </h2>
          <p className="text-sm text-[var(--color-consumer-muted)] mb-5">
            Check the details below. You can go back to edit anything.
          </p>

          <div className="glass-strong p-6 shadow-md space-y-4">
            {/* Summary card per category */}
            <div className="rounded-xl border border-[var(--color-consumer-border)] bg-[var(--color-consumer-glass)] p-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-8 h-8 rounded-lg bg-[var(--color-consumer-primary-soft)] text-[var(--color-consumer-primary)] flex items-center justify-center" aria-hidden="true">
                  <previewCategory.icon
                    className="w-4 h-4"
                    strokeWidth={1.85}
                  />
                </span>
                <span className="font-semibold text-[var(--color-consumer-deep)]">
                  {categoryTitle}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                {showMessageFields && (
                  <FieldRow label="Message" value={messageText} />
                )}
                {showMessageFields && conversationText && (
                  <FieldRow label="Conversation" value={conversationText} />
                )}
                {showCallFields && (
                  <FieldRow label="Phone number" value={phoneNumber} />
                )}
                {showCallFields && (
                  <FieldRow label="What happened in the call" value={callDescription} />
                )}
                {showPaymentFields && upiId && (
                  <FieldRow label="UPI ID" value={upiId} />
                )}
                {showPaymentFields && amount && (
                  <FieldRow label="Amount" value={amount} />
                )}
                {showPaymentFields && paymentDetails && (
                  <FieldRow label="Payment details" value={paymentDetails} />
                )}
                {showLinkFields && (
                  <FieldRow label="Link" value={url} />
                )}
                {showLinkFields && urlWhereReceived && (
                  <FieldRow label="Where received" value={urlWhereReceived} />
                )}
                {showOtherFields && (
                  <FieldRow label="What happened" value={otherDescription} />
                )}
                {attachmentLabel && (
                  <div className="flex items-center gap-2 text-[var(--color-consumer-muted)]">
                    <Upload className="w-4 h-4" />
                    <span>{attachmentLabel}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Privacy notice */}
            <div className="rounded-xl border border-[var(--color-consumer-border)] bg-[var(--color-consumer-glass)] p-4">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-[var(--color-consumer-teal)] shrink-0 mt-0.5" strokeWidth={1.85} />
                <div>
                  <p className="text-sm font-medium text-[var(--color-consumer-text)]">
                    Privacy notice
                  </p>
                  <p className="text-xs text-[var(--color-consumer-muted)] leading-relaxed mt-1">
                    Your report is stored and reviewed by JAAL. We keep it
                    private and do not share it publicly. You can view or
                    update your own reports in My Reports.
                  </p>
                  <label className="mt-3 flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-[var(--color-consumer-border)] text-[var(--color-consumer-teal)] focus:ring-[var(--color-consumer-teal)]"
                      checked={privacyAccepted}
                      onChange={(e) => setPrivacyAccepted(e.target.checked)}
                    />
                    <span className="text-xs text-[var(--color-consumer-muted)] leading-relaxed pt-0.5">
                      I understand this information is stored by JAAL and agree
                      to the privacy notice.
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {attention && (
              <div className="text-sm text-[var(--color-consumer-teal)] bg-[var(--color-consumer-mint)] rounded-xl p-3 border border-[var(--color-consumer-border)]">
                {attention}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-consumer-muted)] hover:text-[var(--color-consumer-text)] transition-colors"
                onClick={handleBack}
              >
                <ChevronLeft className="w-4 h-4" />
                Edit details
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="btn-teal inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm shadow-md disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    Submit Report
                    <CheckCircle2 className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

            {submitError && (
              <div className="text-sm text-[var(--color-consumer-teal)] bg-[var(--color-consumer-mint)] rounded-xl p-3 border border-[var(--color-consumer-border)]">
                {submitError}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Step 4: success */}
      {step === "success" && submitted && (
        <section aria-labelledby="success-title">
          <div className="glass-strong p-8 shadow-xl text-center">
            <div className="w-14 h-14 rounded-full bg-[var(--color-consumer-mint)] text-[var(--color-consumer-teal)] flex items-center justify-center mx-auto mb-4" aria-hidden="true">
              <CheckCircle2 className="w-7 h-7" strokeWidth={2} />
            </div>
            <h2
              id="success-title"
              className="text-2xl font-semibold text-[var(--color-consumer-deep)]"
            >
              Your report has been submitted
            </h2>
            <p className="mt-2 text-[var(--color-consumer-muted)] text-base leading-relaxed max-w-md mx-auto">
              JAAL has received your information. You can track your report
              using the reference below.
            </p>

            <div className="mt-6 max-w-xs mx-auto rounded-2xl border border-[var(--color-consumer-border)] bg-[var(--color-consumer-glass)] p-5 text-left shadow-sm">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-[var(--color-consumer-muted)]">Reference ID</span>
                  <span className="font-mono font-semibold text-[var(--color-consumer-deep)]">
                    {submitted.caseId ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-[var(--color-consumer-muted)]">Category</span>
                  <span className="text-[var(--color-consumer-text)]">
                    {submitted.category ?? categoryTitle}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-[var(--color-consumer-muted)]">Submitted</span>
                  <span className="text-[var(--color-consumer-text)]">
                    {formatDate(submitted.createdAt)}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-[var(--color-consumer-muted)]">Status</span>
                  <span className="chip">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-consumer-teal)]" />
                    {submitted.status === "completed"
                      ? "Completed"
                      : submitted.status === "active"
                      ? "Open"
                      : "Open"}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to={`/consumer/reports/${submitted._id}`}
                className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm shadow-md hover:shadow-lg transition-shadow w-full sm:w-auto justify-center"
              >
                View My Report
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/consumer/dashboard"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-[var(--color-consumer-muted)] hover:text-[var(--color-consumer-text)] border border-[var(--color-consumer-border)] bg-white hover:bg-[var(--color-consumer-glass)] transition-colors w-full sm:w-auto justify-center"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Empty / back link */}
      {step !== "success" && (
        <div className="mt-8 flex items-center justify-between text-sm text-[var(--color-consumer-muted)]">
          <Link
            to="/consumer/dashboard"
            className="inline-flex items-center gap-1 hover:text-[var(--color-consumer-text)] transition-colors"
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
            Back to Dashboard
          </Link>
        </div>
      )}
    </div>
  );
}

function FieldRow({
  label,
  value,
}: {
  label: string;
  value?: string;
}) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-[var(--color-consumer-muted)]">{label}</span>
      <span className="text-[var(--color-consumer-text)] break-words text-right min-w-0">
        {value}
      </span>
    </div>
  );
}

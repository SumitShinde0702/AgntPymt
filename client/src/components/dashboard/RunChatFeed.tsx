import { AlertCircle, Bot, CheckCircle2, ExternalLink, Scale, Store } from "lucide-react";
import type { RunEvent } from "../../lib/api";
import { txExplorerUrl } from "../../lib/explorer";

type ChatRole = "buyer" | "seller" | "system";

const STEP_LABELS: Record<string, string> = {
  run_started: "Run started",
  purchase_intent: "Purchase request",
  vendor_matched: "Vendor matched",
  seller_contacted: "Seller reached out",
  seller_quoted: "Quote received",
  negotiation_round: "Negotiation",
  deal_accepted: "Deal agreed",
  policy_evaluated: "Policy check",
  payment_simulated: "Payment",
  payment_settled: "Payment sent",
  payment_failed: "Payment failed",
  payment_pending: "Awaiting approval",
  order_fulfilled: "Order delivered",
  run_completed: "Run complete",
  run_failed: "Run failed",
  planning: "Planning",
  local_runner: "Local mode",
  hermes_delegated: "Hermes",
  hermes_message: "Agent",
  hermes_tool: "Tool",
  hermes_approval: "Approval needed",
  hermes_approval_granted: "Approved",
  hermes_approval_denied: "Denied",
  user_message: "You",
};

function txHashFromEvent(event: RunEvent): string | undefined {
  const hash = event.payload?.txHash;
  return typeof hash === "string" && hash.startsWith("0x") ? hash : undefined;
}

function TxHashLink({ txHash }: { txHash: string }) {
  const short = `${txHash.slice(0, 10)}…${txHash.slice(-8)}`;
  return (
    <a
      href={txExplorerUrl(txHash)}
      target="_blank"
      rel="noreferrer"
      className="mt-1 inline-flex items-center gap-1 text-xs font-medium underline hover:opacity-80"
    >
      {short}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function classifyEvent(event: RunEvent, agentName?: string): ChatRole {
  const actor = event.actor ?? "";
  if (event.step === "user_message" || actor === "You" || actor === agentName) return "buyer";
  if (
    actor === "AgntPymt" ||
    actor.startsWith("AgntPymt ") ||
    actor === "Hermes" ||
    event.step === "hermes_tool" ||
    event.step === "hermes_delegated" ||
    !actor
  ) {
    return "system";
  }
  return "seller";
}

function isFailureStep(step: string) {
  return step === "payment_failed" || step === "run_failed" || step === "hermes_approval_denied";
}

function isSuccessStep(step: string) {
  return (
    step === "run_completed" ||
    step === "payment_settled" ||
    step === "order_fulfilled" ||
    step === "hermes_approval_granted"
  );
}

function isApprovalPendingStep(step: string) {
  return step === "hermes_approval";
}

function ChatBubble({
  event,
  role,
  agentName,
  onHermesApproval,
  approvalResolved,
}: {
  event: RunEvent;
  role: ChatRole;
  agentName?: string;
  onHermesApproval?: (approvalId: string, choice: "approve" | "deny") => void | Promise<void>;
  approvalResolved?: boolean;
}) {
  const label = STEP_LABELS[event.step] ?? event.step.replace(/_/g, " ");
  const failed = isFailureStep(event.step);
  const success = isSuccessStep(event.step);
  const pendingApproval = isApprovalPendingStep(event.step) && !approvalResolved;
  const approvalId =
    typeof event.payload?.approvalId === "string" ? event.payload.approvalId : undefined;
  const txHash = txHashFromEvent(event);

  if (role === "system") {
    return (
      <div className="flex justify-center px-2 py-1">
        <div
          className={`max-w-[90%] rounded-2xl px-3 py-2 text-center text-xs ${
            failed
              ? "border border-red-200 bg-red-50 text-red-800"
              : success
                ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                : pendingApproval
                  ? "border border-amber-200 bg-amber-50 text-amber-900"
                  : "border border-slate-200 bg-white text-slate-600"
          }`}
        >
          <div className="mb-0.5 flex items-center justify-center gap-1 font-semibold uppercase tracking-wide">
            {failed && <AlertCircle className="h-3 w-3" />}
            {success && <CheckCircle2 className="h-3 w-3" />}
            {pendingApproval && <AlertCircle className="h-3 w-3 text-amber-600" />}
            {event.step === "policy_evaluated" && <Scale className="h-3 w-3" />}
            {label}
          </div>
          <p className="text-left text-sm leading-snug">{event.message}</p>
          {pendingApproval && approvalId && onHermesApproval && (
            <div className="mt-2 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => void onHermesApproval(approvalId, "deny")}
                className="rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Deny
              </button>
              <button
                type="button"
                onClick={() => void onHermesApproval(approvalId, "approve")}
                className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700"
              >
                Approve once
              </button>
            </div>
          )}
          {txHash && (
            <div className="text-left">
              <TxHashLink txHash={txHash} />
            </div>
          )}
        </div>
      </div>
    );
  }

  const isBuyer = role === "buyer";
  const isUser = event.step === "user_message" || event.actor === "You";

  return (
    <div className={`flex gap-2 px-1 py-1 ${isBuyer ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isBuyer ? "bg-brand-100 text-brand-700" : "bg-violet-100 text-violet-700"
        }`}
      >
        {isBuyer ? <Bot className="h-4 w-4" /> : <Store className="h-4 w-4" />}
      </div>

      <div className={`max-w-[78%] ${isBuyer ? "items-end" : "items-start"} flex flex-col`}>
        <div className={`mb-0.5 text-[11px] font-medium ${isBuyer ? "text-right text-brand-600" : "text-violet-600"}`}>
          {isUser ? "You" : isBuyer ? "Your agent" : "Vendor"}
          {event.actor && event.actor !== agentName && (
            <span className="text-slate-400"> · {event.actor}</span>
          )}
        </div>
        <div
          className={`rounded-2xl px-3 py-2 text-sm leading-snug shadow-sm ${
            isBuyer
              ? "rounded-tr-sm bg-brand-600 text-white"
              : "rounded-tl-sm border border-violet-200 bg-violet-50 text-slate-800"
          }`}
        >
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide opacity-70">
            {label}
          </span>
          {event.message}
          {txHash && (
            <div className={isBuyer ? "text-brand-100" : ""}>
              <TxHashLink txHash={txHash} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type Props = {
  events: RunEvent[];
  agentName?: string;
  emptyMessage?: string;
  onHermesApproval?: (approvalId: string, choice: "approve" | "deny") => void | Promise<void>;
};

export function RunChatFeed({ events, agentName, emptyMessage, onHermesApproval }: Props) {
  const visible = events.filter((e) => e.step !== "run_started" || events.length <= 2);
  const resolvedApprovalIds = new Set(
    events
      .filter((e) => e.step === "hermes_approval_granted" || e.step === "hermes_approval_denied")
      .map((e) => e.payload?.approvalId)
      .filter((id): id is string => typeof id === "string")
  );

  if (visible.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 text-center">
        <div className="mb-3 flex gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-600">
            <Bot className="h-5 w-5" />
          </div>
          <div className="flex items-center text-slate-300">↔</div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-violet-600">
            <Store className="h-5 w-5" />
          </div>
        </div>
        <p className="text-sm text-slate-400">
          {emptyMessage ?? "Agent runs stream here — Hermes replies, tools, and payment steps."}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Purchases go through AgntPymt policy when the agent calls{" "}
          <code className="rounded bg-slate-100 px-1">agntpymt_initiate_purchase</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 py-2">
      {visible.map((e, i) => {
        const approvalId =
          typeof e.payload?.approvalId === "string" ? e.payload.approvalId : undefined;
        return (
          <ChatBubble
            key={`${e.createdAt}-${e.step}-${i}`}
            event={e}
            role={classifyEvent(e, agentName)}
            agentName={agentName}
            onHermesApproval={onHermesApproval}
            approvalResolved={approvalId ? resolvedApprovalIds.has(approvalId) : false}
          />
        );
      })}
    </div>
  );
}

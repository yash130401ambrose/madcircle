export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    PENDING: { cls: "pending", label: "Pending" },
    APPROVED: { cls: "success", label: "Approved" },
    PAID: { cls: "success", label: "Paid" },
    REJECTED: { cls: "danger", label: "Rejected" },
    VOID: { cls: "danger", label: "Void" },
    SUBMITTED: { cls: "pending", label: "In review" },
    VERIFIED: { cls: "success", label: "Verified match" },
    ACTIVE: { cls: "success", label: "Active" },
  };
  const item = map[status] ?? { cls: "pending", label: status };
  return (
    <span className={`mc-badge ${item.cls}`}>
      <span aria-hidden="true">●</span>
      {item.label}
    </span>
  );
}
